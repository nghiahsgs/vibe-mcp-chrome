/**
 * Test: Navigate to Gmail, wait for full load, screenshot, and extract content.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const log = (...args: unknown[]) => console.error("[TEST]", ...args);

const server = spawn("npx", ["tsx", "src/cli.ts", "--profile", "Default", "-k"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, DEBUG: "1" },
});

server.stderr?.on("data", (d: Buffer) => process.stderr.write(`  [SRV] ${d.toString()}`));

let requestId = 0;
function sendRequest(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
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
        } catch { /* wait */ }
      }
    };
    server.stdout?.on("data", onData);
    server.stdin?.write(msg);
    setTimeout(() => {
      server.stdout?.removeListener("data", onData);
      reject(new Error(`${method} timed out`));
    }, 60000);
  });
}

await new Promise(r => setTimeout(r, 15000));

log("=== Gmail Full Load Test ===\n");

try {
  // Initialize
  log("1. Initialize...");
  await sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "gmail-test", version: "1.0" },
  });
  server.stdin?.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  await new Promise(r => setTimeout(r, 500));

  // Navigate to Gmail
  log("2. Navigate to mail.google.com...");
  const navResult = await sendRequest("tools/call", {
    name: "navigate",
    arguments: { url: "https://mail.google.com" },
  }) as { result?: { content?: Array<{ text?: string }> } };
  log("  ", navResult?.result?.content?.[0]?.text);

  // Wait for Gmail to fully load (heavy JS app)
  log("3. Waiting 15s for Gmail JS to render...");
  await new Promise(r => setTimeout(r, 15000));

  // Check URL
  log("4. Current URL...");
  const urlResult = await sendRequest("tools/call", {
    name: "evaluate_js",
    arguments: { code: "window.location.href" },
  }) as { result?: { content?: Array<{ text?: string }> } };
  log("   URL:", urlResult?.result?.content?.[0]?.text);

  // Take screenshot
  log("5. Screenshot...");
  const ssResult = await sendRequest("tools/call", {
    name: "screenshot",
    arguments: {},
  }) as { result?: { content?: Array<{ type?: string; data?: string }> } };
  const imgData = ssResult?.result?.content?.[0]?.data;
  if (imgData) {
    writeFileSync("/tmp/gmail-screenshot.png", Buffer.from(imgData, "base64"));
    log("   Saved /tmp/gmail-screenshot.png");
  }

  // Page title
  log("6. Page title...");
  const titleResult = await sendRequest("tools/call", {
    name: "evaluate_js",
    arguments: { code: "document.title" },
  }) as { result?: { content?: Array<{ text?: string }> } };
  log("   Title:", titleResult?.result?.content?.[0]?.text);

  // Extract email subjects from inbox
  log("7. Extract inbox emails...");
  const emailsResult = await sendRequest("tools/call", {
    name: "evaluate_js",
    arguments: {
      code: `
        // Try to get email rows from Gmail inbox
        const rows = document.querySelectorAll('tr.zA');
        if (rows.length === 0) {
          // Fallback: get visible text
          document.body?.innerText?.slice(0, 5000) || 'no content';
        } else {
          const emails = [];
          rows.forEach((row, i) => {
            if (i >= 15) return;
            const sender = row.querySelector('.yW span')?.getAttribute('name') || row.querySelector('.yW')?.textContent?.trim() || '';
            const subject = row.querySelector('.bog')?.textContent?.trim() || '';
            const snippet = row.querySelector('.y2')?.textContent?.trim() || '';
            const date = row.querySelector('.xW')?.textContent?.trim() || '';
            const unread = row.classList.contains('zE') ? '[NEW] ' : '';
            emails.push(unread + sender + ' | ' + subject + ' ' + snippet + ' | ' + date);
          });
          emails.join('\\n');
        }
      `,
    },
  }) as { result?: { content?: Array<{ text?: string }> } };
  const emailText = emailsResult?.result?.content?.[0]?.text ?? "";
  log("   Inbox content:\n");
  console.error(emailText.slice(0, 4000));

  log("\n=== Done! ===");
} catch (err) {
  log("FAILED:", err);
} finally {
  server.kill("SIGTERM");
  await new Promise(r => setTimeout(r, 1000));
  process.exit(0);
}
