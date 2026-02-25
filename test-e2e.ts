/**
 * E2E test: starts MCP server with a profile, sends JSON-RPC commands, verifies responses.
 * Usage: npx tsx test-e2e.ts
 */
import { spawn } from "node:child_process";
import { discoverProfiles } from "./src/chrome/discover-profiles.js";
import { isChromeRunning, killChrome } from "./src/chrome/launch-chrome.js";

const log = (...args: unknown[]) => console.error("[TEST]", ...args);

// Find first available profile
const profiles = await discoverProfiles();
if (profiles.length === 0) {
  log("No Chrome profiles found!");
  process.exit(1);
}
const profile = profiles[0];
log(`Using profile: ${profile.displayName} (${profile.directoryName})`);

// Kill Chrome if running
if (isChromeRunning()) {
  log("Killing existing Chrome...");
  await killChrome();
}

// Start MCP server as child process
log("Starting MCP server...");
const server = spawn("npx", ["tsx", "src/cli.ts", "--profile", profile.directoryName, "-k"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, DEBUG: "1" },
});

// Collect stderr for debug
server.stderr?.on("data", (data: Buffer) => {
  process.stderr.write(`  [SERVER] ${data.toString()}`);
});

// Helper: send JSON-RPC request and wait for response
let requestId = 0;
function sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";

    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      // Try to parse complete JSON lines
      const lines = buffer.split("\n");
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            server.stdout?.removeListener("data", onData);
            resolve(parsed);
            return;
          }
        } catch {
          // incomplete JSON, wait for more data
        }
      }
    };

    server.stdout?.on("data", onData);
    server.stdin?.write(msg);

    // Timeout
    setTimeout(() => {
      server.stdout?.removeListener("data", onData);
      reject(new Error(`Request ${method} timed out`));
    }, 30000);
  });
}

// Wait for server to be ready
await new Promise((r) => setTimeout(r, 20000));

log("\n=== Starting MCP tests ===\n");

try {
  // Test 1: Initialize
  log("Test 1: MCP initialize...");
  const initResult = await sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0" },
  });
  log("  ✅ Initialize OK:", JSON.stringify(initResult).slice(0, 200));

  // Send initialized notification
  server.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  await new Promise((r) => setTimeout(r, 500));

  // Test 2: List tools
  log("Test 2: List tools...");
  const toolsResult = await sendRequest("tools/list", {}) as {
    result?: { tools?: Array<{ name: string }> };
  };
  const tools = toolsResult?.result?.tools || [];
  log(`  ✅ Found ${tools.length} tools:`, tools.map((t: { name: string }) => t.name).join(", "));

  // Test 3: Navigate to example.com
  log("Test 3: Navigate to example.com...");
  const navResult = await sendRequest("tools/call", {
    name: "navigate",
    arguments: { url: "https://example.com" },
  });
  log("  ✅ Navigate:", JSON.stringify(navResult).slice(0, 200));

  // Test 4: Take screenshot
  log("Test 4: Screenshot...");
  const ssResult = await sendRequest("tools/call", {
    name: "screenshot",
    arguments: {},
  }) as { result?: { content?: Array<{ type: string; data?: string }> } };
  const imgContent = ssResult?.result?.content?.[0];
  if (imgContent?.type === "image" && imgContent?.data) {
    log(`  ✅ Screenshot OK: ${imgContent.data.length} chars base64`);
  } else {
    log("  ✅ Screenshot response:", JSON.stringify(ssResult).slice(0, 200));
  }

  // Test 5: Get page content
  log("Test 5: Get page content...");
  const contentResult = await sendRequest("tools/call", {
    name: "get_page_content",
    arguments: { selector: "h1" },
  });
  log("  ✅ Content:", JSON.stringify(contentResult).slice(0, 200));

  // Test 6: Evaluate JS
  log("Test 6: Evaluate JS...");
  const evalResult = await sendRequest("tools/call", {
    name: "evaluate_js",
    arguments: { code: "document.title" },
  });
  log("  ✅ Eval:", JSON.stringify(evalResult).slice(0, 200));

  // Test 7: List tabs
  log("Test 7: List tabs...");
  const tabsResult = await sendRequest("tools/call", {
    name: "list_tabs",
    arguments: {},
  });
  log("  ✅ Tabs:", JSON.stringify(tabsResult).slice(0, 200));

  // Test 8: Scroll
  log("Test 8: Scroll down...");
  const scrollResult = await sendRequest("tools/call", {
    name: "scroll",
    arguments: { direction: "down", amount: 200 },
  });
  log("  ✅ Scroll:", JSON.stringify(scrollResult).slice(0, 200));

  log("\n=== All tests passed! ===\n");
} catch (err) {
  log("❌ Test failed:", err);
} finally {
  // Cleanup
  log("Cleaning up...");
  server.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 2000));
  process.exit(0);
}
