#!/usr/bin/env node

import { Command } from "commander";
import { confirm, select } from "@inquirer/prompts";
import {
  discoverProfiles,
  getChromeUserDataDir,
} from "./chrome/discover-profiles.js";
import {
  isChromeRunning,
  killChrome,
  tryExistingCDP,
  launchChrome,
  setupCleanup,
} from "./chrome/launch-chrome.js";
import { connectCDP } from "./chrome/connect-cdp.js";
import { createMcpServer, startServer } from "./mcp/server.js";
import { log } from "./utils/logger.js";

const program = new Command();

program
  .name("chrome-profile-mcp")
  .description(
    "Launch MCP server controlling Chrome with a specific profile"
  )
  .version("0.1.0")
  .option(
    "-p, --profile <name>",
    "Profile directory name (skip interactive selection)"
  )
  .option("--port <number>", "CDP port", "9222")
  .option("-k, --kill-existing", "Auto-close Chrome if already running")
  .option("--debug", "Enable debug logging")
  .action(async (opts) => {
    if (opts.debug) process.env.DEBUG = "1";

    try {
      await run(opts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(msg);
      process.exit(1);
    }
  });

program.parse();

async function run(opts: {
  profile?: string;
  port: string;
  killExisting?: boolean;
  debug?: boolean;
}): Promise<void> {
  // Platform guard
  if (process.platform !== "darwin") {
    throw new Error("Currently macOS-only. Linux/Windows support coming soon.");
  }

  // Validate port
  const port = parseInt(opts.port, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: "${opts.port}". Must be 1-65535.`);
  }

  // 1. Handle Chrome already running (BEFORE profile selection)
  const existingCdp = await tryExistingCDP(port);
  if (!existingCdp && isChromeRunning()) {
    if (opts.killExisting) {
      // Flag mode: kill silently
      await killChrome();
    } else if (!opts.profile) {
      // Interactive mode: ask user
      const shouldKill = await confirm({
        message:
          "Chrome is running without CDP. Close it and relaunch with CDP?",
        default: true,
      });
      if (!shouldKill) {
        throw new Error("Cannot proceed while Chrome is running without CDP.");
      }
      await killChrome();
    } else {
      // Non-interactive without -k flag: error
      throw new Error(
        "Chrome is already running without CDP. Use -k to auto-close it."
      );
    }
  }

  // 2. Discover profiles
  log.info("Discovering Chrome profiles...");
  const profiles = await discoverProfiles();

  if (profiles.length === 0) {
    throw new Error("No Chrome profiles found. Is Chrome installed?");
  }

  // 3. Select profile
  let selectedProfile;
  if (opts.profile) {
    selectedProfile = profiles.find(
      (p) => p.directoryName === opts.profile
    );
    if (!selectedProfile) {
      throw new Error(
        `Profile "${opts.profile}" not found. Available: ${profiles
          .map((p) => p.directoryName)
          .join(", ")}`
      );
    }
  } else {
    const choice = await select({
      message: "Select Chrome profile:",
      choices: profiles.map((p) => ({
        name: `${p.displayName} (${p.directoryName})`,
        value: p.directoryName,
      })),
    });
    selectedProfile = profiles.find(
      (p) => p.directoryName === choice
    )!;
  }

  log.info(`Selected profile: ${selectedProfile.displayName}`);

  // 4. Launch Chrome with CDP
  log.info(`Launching Chrome with CDP on port ${port}...`);
  const chrome = await launchChrome({
    userDataDir: getChromeUserDataDir(),
    profileDirectory: selectedProfile.directoryName,
    port,
  });
  log.info("Chrome launched successfully.");

  // 5. Connect Playwright via CDP
  log.info("Connecting to Chrome via CDP...");
  const { browser, context, page } = await connectCDP(chrome.cdpUrl);

  // 6. Setup cleanup handlers
  setupCleanup(chrome, browser);

  // 7. Create and start MCP server
  log.info("Starting MCP server...");
  const server = await createMcpServer(browser, context, page);
  await startServer(server);
}
