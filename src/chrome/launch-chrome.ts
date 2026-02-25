import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdtemp, symlink, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import type { Browser } from "playwright";
import { log } from "../utils/logger.js";

const CHROME_PATH =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export interface LaunchOptions {
  userDataDir: string;
  profileDirectory: string;
  port?: number;
}

export interface ChromeInstance {
  process: ChildProcess | null;
  port: number;
  cdpUrl: string;
  /** Temp dir to clean up on shutdown (if created). */
  tempDir?: string;
}

/** Check if any Chrome process is currently running. */
export function isChromeRunning(): boolean {
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

/** Force-kill all Chrome processes and wait for them to exit. */
export async function killChrome(): Promise<void> {
  log.info("Closing existing Chrome processes...");
  try {
    execSync('pkill -f "Google Chrome"', { stdio: "ignore" });
  } catch {
    /* may already be dead */
  }
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (!isChromeRunning()) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  log.warn("Chrome processes may still be exiting...");
}

/** Check if a port is free. */
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
  timeoutMs = 30000
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      const data = (await res.json()) as {
        webSocketDebuggerUrl: string;
      };
      return data.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(
    `CDP not available on port ${port} after ${timeoutMs}ms.`
  );
}

/** Try connecting to an already-running CDP endpoint. */
export async function tryExistingCDP(
  port: number
): Promise<string | null> {
  try {
    const res = await fetch(`http://localhost:${port}/json/version`);
    const data = (await res.json()) as {
      webSocketDebuggerUrl: string;
    };
    return data.webSocketDebuggerUrl;
  } catch {
    return null;
  }
}

/**
 * Create a temp user-data-dir with symlinked profile.
 * Chrome 136+ blocks CDP on the default data dir, so we use a
 * separate temp dir with the profile symlinked to preserve cookies/sessions.
 */
async function createTempUserDataDir(
  userDataDir: string,
  profileDirectory: string
): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "chrome-mcp-"));
  const profileSrc = join(userDataDir, profileDirectory);
  const profileDst = join(tempDir, profileDirectory);

  await symlink(profileSrc, profileDst);

  // Copy Local State (Chrome needs it for profile metadata)
  try {
    await copyFile(
      join(userDataDir, "Local State"),
      join(tempDir, "Local State")
    );
  } catch {
    /* optional - Chrome works without it */
  }

  log.debug(`Temp user-data-dir: ${tempDir}`);
  return tempDir;
}

/**
 * Launch Chrome with CDP debugging.
 * Uses a temp user-data-dir with symlinked profile (Chrome 136+ requirement).
 */
export async function launchChrome(
  opts: LaunchOptions
): Promise<ChromeInstance> {
  const port = opts.port ?? 9222;

  // Reuse existing CDP if available
  const existingCdp = await tryExistingCDP(port);
  if (existingCdp) {
    log.info(`Found existing Chrome CDP on port ${port}, reusing.`);
    return { process: null, port, cdpUrl: existingCdp };
  }

  // Check port availability
  const available = await isPortAvailable(port);
  if (!available) {
    throw new Error(
      `Port ${port} is in use. Close the process using it or use --port.`
    );
  }

  // Chrome 136+: use temp dir with symlinked profile
  const tempDir = await createTempUserDataDir(
    opts.userDataDir,
    opts.profileDirectory
  );

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
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

  const cdpUrl = await waitForCDP(port);
  return { process: chromeProcess, port, cdpUrl, tempDir };
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
    // Clean up temp dir (only remove the symlink + copied files, not the real profile)
    if (chrome.tempDir) {
      try {
        await rm(chrome.tempDir, { recursive: true });
      } catch {
        /* best effort */
      }
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
