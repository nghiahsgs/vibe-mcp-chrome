# Phase 3: Chrome Launch + CDP Connection

## Context
After profile selection, need to launch Chrome with that profile + CDP debugging, then connect Playwright. Chrome 136+ requires `--user-data-dir` with `--remote-debugging-port`.

## Overview
Implement `launch-chrome.ts` (spawn Chrome process) and `connect-cdp.ts` (Playwright CDP connection).

## Requirements
- Launch real Chrome binary with selected profile + CDP port
- Handle Chrome already running (warn user, or detect existing CDP)
- Wait for CDP endpoint to become available
- Connect Playwright via `connectOverCDP`
- Return browser + default page references
- Clean shutdown on process exit

## Implementation Steps

### 3.1 Chrome launcher (`src/chrome/launch-chrome.ts`)

```typescript
import { spawn, ChildProcess } from "node:child_process";
import { log } from "../utils/logger.js";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export interface LaunchOptions {
  profilePath: string;     // Full path to profile dir
  userDataDir: string;     // Chrome user data dir (parent)
  port?: number;           // CDP port, default 9222
}

export interface ChromeInstance {
  process: ChildProcess;
  port: number;
  cdpUrl: string;
}

export async function launchChrome(opts: LaunchOptions): Promise<ChromeInstance> {
  const port = opts.port ?? 9222;

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${opts.userDataDir}`,
    `--profile-directory=${extractProfileDir(opts.profilePath)}`,
    "--no-first-run",
    "--no-default-browser-check",
  ];

  const chromeProcess = spawn(CHROME_PATH, args, {
    stdio: "ignore",
    detached: false,
  });

  chromeProcess.on("error", (err) => {
    log.error("Chrome launch failed:", err.message);
  });

  // Wait for CDP to become available
  const cdpUrl = await waitForCDP(port);

  return {
    process: chromeProcess,
    port,
    cdpUrl,
  };
}
```

### 3.2 Wait for CDP endpoint
Poll `http://localhost:{port}/json/version` until available:

```typescript
async function waitForCDP(port: number, timeoutMs = 15000): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      const data = await res.json();
      return data.webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`CDP not available on port ${port} after ${timeoutMs}ms`);
}
```

### 3.3 Port availability check
Before launching, verify port is free:

```typescript
import { createServer } from "node:net";

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
```

If port occupied, either: (a) try connecting to existing CDP, or (b) throw with message to close Chrome.

### 3.4 CDP connection (`src/chrome/connect-cdp.ts`)

```typescript
import { chromium, Browser, Page, BrowserContext } from "playwright";
import { log } from "../utils/logger.js";

export interface BrowserConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export async function connectCDP(cdpUrl: string): Promise<BrowserConnection> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    throw new Error("No browser contexts found after CDP connection");
  }

  const context = contexts[0];
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  log.info(`Connected to Chrome via CDP. ${pages.length} existing tab(s).`);

  return { browser, context, page };
}
```

### 3.5 Cleanup handler
Register shutdown hooks to close browser + kill Chrome process:

```typescript
export function setupCleanup(chrome: ChromeInstance, browser: Browser): void {
  const cleanup = async () => {
    log.info("Shutting down...");
    try { await browser.close(); } catch {}
    try { chrome.process.kill(); } catch {}
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
  process.on("exit", () => {
    try { chrome.process.kill(); } catch {}
  });
}
```

### 3.6 Profile directory extraction
```typescript
function extractProfileDir(profilePath: string): string {
  // "/path/to/Chrome/Profile 1" -> "Profile 1"
  return profilePath.split("/").pop()!;
}
```

## Todo
- [ ] Implement launchChrome() with CDP flags
- [ ] Implement waitForCDP() polling
- [ ] Implement isPortAvailable() check
- [ ] Implement connectCDP() via Playwright
- [ ] Implement cleanup/shutdown handlers
- [ ] Handle Chrome already running scenario
- [ ] Test launch + CDP connection with real Chrome
- [ ] Verify profile loads correctly (cookies, extensions visible)

## Success Criteria
- Chrome launches with specified profile
- CDP endpoint becomes available within 15s
- Playwright connects and can list pages
- User's cookies/extensions are preserved
- Clean shutdown kills Chrome process
- Port conflict detected and reported
