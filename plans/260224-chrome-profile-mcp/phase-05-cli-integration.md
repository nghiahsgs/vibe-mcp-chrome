# Phase 5: CLI Integration

## Context
Orchestration layer. CLI ties together profile discovery, Chrome launch, CDP connection, and MCP server startup. Uses commander for parsing and @inquirer/prompts for interactive profile selection.

## Overview
Implement `cli.ts` as the main entry point that provides interactive profile selection and launches the full MCP server pipeline.

## Requirements
- `chrome-profile-mcp` with no args: interactive mode (list profiles, user selects)
- `chrome-profile-mcp --profile "Profile 1"`: skip selection, use named profile
- `--port 9222`: configurable CDP port
- `--debug`: enable debug logging
- Graceful error messages for all failure modes
- Shebang for npx compatibility

## Implementation Steps

### 5.1 CLI entry point (`src/cli.ts`)

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { select } from "@inquirer/prompts";
import { discoverProfiles } from "./chrome/discover-profiles.js";
import { launchChrome } from "./chrome/launch-chrome.js";
import { connectCDP } from "./chrome/connect-cdp.js";
import { createMcpServer, startServer } from "./mcp/server.js";
import { setupCleanup } from "./chrome/launch-chrome.js";
import { log } from "./utils/logger.js";

const program = new Command();

program
  .name("chrome-profile-mcp")
  .description("Launch MCP server controlling Chrome with a specific profile")
  .version("0.1.0")
  .option("-p, --profile <name>", "Profile directory name (skip selection)")
  .option("--port <number>", "CDP port", "9222")
  .option("--debug", "Enable debug logging")
  .action(async (opts) => {
    if (opts.debug) process.env.DEBUG = "1";

    try {
      await run(opts);
    } catch (err: any) {
      log.error(err.message);
      process.exit(1);
    }
  });

program.parse();
```

### 5.2 Main run function

```typescript
async function run(opts: { profile?: string; port: string; debug?: boolean }) {
  // 1. Discover profiles
  log.info("Discovering Chrome profiles...");
  const profiles = await discoverProfiles();

  if (profiles.length === 0) {
    throw new Error("No Chrome profiles found. Is Chrome installed?");
  }

  // 2. Select profile
  let selectedProfile;
  if (opts.profile) {
    selectedProfile = profiles.find(p => p.directoryName === opts.profile);
    if (!selectedProfile) {
      throw new Error(`Profile "${opts.profile}" not found. Available: ${profiles.map(p => p.directoryName).join(", ")}`);
    }
  } else {
    const choice = await select({
      message: "Select Chrome profile:",
      choices: profiles.map(p => ({
        name: `${p.displayName} (${p.directoryName})`,
        value: p.directoryName,
      })),
    });
    selectedProfile = profiles.find(p => p.directoryName === choice)!;
  }

  log.info(`Selected profile: ${selectedProfile.displayName}`);

  // 3. Launch Chrome
  const port = parseInt(opts.port, 10);
  log.info(`Launching Chrome with CDP on port ${port}...`);
  const chrome = await launchChrome({
    profilePath: selectedProfile.profilePath,
    userDataDir: getChromeUserDataDir(),
    port,
  });
  log.info("Chrome launched successfully");

  // 4. Connect Playwright
  log.info("Connecting to Chrome via CDP...");
  const { browser, context, page } = await connectCDP(chrome.cdpUrl);
  log.info("Connected to Chrome");

  // 5. Setup cleanup
  setupCleanup(chrome, browser);

  // 6. Create and start MCP server
  log.info("Starting MCP server...");
  const server = await createMcpServer(browser, context, page);
  await startServer(server);
}
```

### 5.3 Interactive output considerations
- All log messages via `console.error()` (never stdout)
- Inquirer prompts write to stderr naturally
- Only MCP JSON-RPC goes to stdout
- After profile selection, suppress interactive output

### 5.4 Error scenarios to handle
1. Chrome not installed: "Chrome not found at /Applications/..."
2. No profiles: "No Chrome profiles found. Is Chrome installed?"
3. Profile not found (--profile flag): list available profiles
4. Port occupied: "Port 9222 in use. Close Chrome or use --port"
5. CDP connection timeout: "Could not connect to Chrome CDP"
6. User cancels selection (Ctrl+C): clean exit

## Todo
- [ ] Implement CLI with commander
- [ ] Implement interactive profile selection with @inquirer/prompts
- [ ] Implement --profile flag for non-interactive mode
- [ ] Implement --port flag
- [ ] Implement --debug flag
- [ ] Wire up full pipeline: discover -> select -> launch -> connect -> serve
- [ ] Handle all error scenarios with descriptive messages
- [ ] Test interactive mode end-to-end
- [ ] Test non-interactive mode (--profile flag)
- [ ] Verify npx compatibility with shebang

## Success Criteria
- Interactive mode shows profile list, user selects, server starts
- `--profile` flag skips selection, launches directly
- All errors show helpful messages (not stack traces)
- Ctrl+C cleanly exits at any stage
- `npx chrome-profile-mcp` works after npm publish
