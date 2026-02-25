import { spawn, execSync, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import type { Browser } from "playwright";
import { log } from "../utils/logger.js";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Check if any Chrome process is currently running. */
function isChromeRunning(): boolean {
  try {
    const result = execSync(
      'pgrep -f "Google Chrome" 2>/dev/null',
      { encoding: "utf-8" }
    );
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

export interface LaunchOptions {
  userDataDir: string;
  profileDirectory: string;
  port?: number;
  /** If true, kill existing Chrome before launching with CDP. */
  killExisting?: boolean;
}

export interface ChromeInstance {
  process: ChildProcess | null;
  port: number;
  cdpUrl: string;
}

/** Force-kill all Chrome processes. */
function killChrome(): void {
  try {
    execSync('pkill -f "Google Chrome"', { stdio: "ignore" });
  } catch {
    /* may already be dead */
  }
}

/** Check if a port is free before launching Chrome. */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Poll CDP endpoint until it responds. */
async function waitForCDP(
  port: number,
  timeoutMs = 15000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      const data = (await res.json()) as { webSocketDebuggerUrl: string };
      return data.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `CDP not available on port ${port} after ${timeoutMs}ms. Is Chrome already running? Close it and try again.`
  );
}

/**
 * Try connecting to an already-running CDP endpoint.
 * Returns the websocket URL if successful, null otherwise.
 */
async function tryExistingCDP(
  port: number
): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    const data = (await res.json()) as { webSocketDebuggerUrl: string };
    return data.webSocketDebuggerUrl;
  } catch {
    return null;
  }
}

/** Launch Chrome with CDP debugging on the specified profile. */
export async function launchChrome(
  opts: LaunchOptions
): Promise<ChromeInstance> {
  const port = opts.port ?? 9222;

  // Check if CDP already running on this port
  const existingCdp = await tryExistingCDP(port);
  if (existingCdp) {
    log.info(`Found existing Chrome CDP on port ${port}, reusing.`);
    return { process: null, port, cdpUrl: existingCdp };
  }

  // Check if Chrome is already running WITHOUT CDP
  if (isChromeRunning()) {
    if (opts.killExisting) {
      log.info("Closing existing Chrome processes...");
      killChrome();
      // Wait for Chrome to fully exit
      await new Promise((r) => setTimeout(r, 2000));
    } else {
      throw new Error(
        "Chrome is already running without CDP debugging.\n" +
          "Run with --kill-existing to auto-close Chrome, or close it manually."
      );
    }
  }

  // Check port availability
  const available = await isPortAvailable(port);
  if (!available) {
    throw new Error(
      `Port ${port} is in use but no CDP endpoint found. Close the process using it or use --port to pick another.`
    );
  }

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${opts.userDataDir}`,
    `--profile-directory=${opts.profileDirectory}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];

  log.debug("Chrome args:", args);

  const chromeProcess = spawn(CHROME_PATH, args, {
    stdio: "ignore",
    detached: false,
  });

  chromeProcess.on("error", (err) => {
    log.error("Chrome launch failed:", err.message);
  });

  // Wait for CDP to become available
  const cdpUrl = await waitForCDP(port);

  return { process: chromeProcess, port, cdpUrl };
}

/** Register process cleanup handlers for graceful shutdown. */
export function setupCleanup(
  chrome: ChromeInstance,
  browser: Browser
): void {
  let cleaning = false;
  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    log.info("Shutting down...");
    try {
      await browser.close();
    } catch {
      /* browser may already be closed */
    }
    try {
      chrome.process?.kill();
    } catch {
      /* process may already be dead */
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", () => {
    try {
      chrome.process?.kill();
    } catch {
      /* noop */
    }
  });
}
