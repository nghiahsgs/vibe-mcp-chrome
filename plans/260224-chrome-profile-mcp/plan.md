# Chrome Profile MCP Server - Implementation Plan

## Overview
CLI tool that discovers Chrome profiles, launches Chrome with CDP debugging, and exposes browser control via MCP server for AI integration.

## Tech Stack
TypeScript, Node.js, Playwright CDP, MCP SDK, Commander, Inquirer, Zod

## Architecture
```
src/
├── cli.ts                    # CLI entry (commander + inquirer)
├── chrome/
│   ├── discover-profiles.ts  # Read Local State for profiles
│   ├── launch-chrome.ts      # Spawn Chrome with CDP flags
│   └── connect-cdp.ts        # Playwright connectOverCDP wrapper
├── mcp/
│   ├── server.ts             # MCP server + tool registration
│   └── tools/
│       ├── navigation.ts     # navigate, go_back, go_forward, reload, tabs
│       ├── interaction.ts    # click, type, scroll, hover, select, key
│       └── inspection.ts     # screenshot, get_page_content, eval_js, wait
└── utils/
    └── logger.ts             # stderr logger (stdio-safe)
```

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Project Setup | DONE | [phase-01](./phase-01-project-setup.md) |
| 2 | Chrome Profile Discovery | DONE | [phase-02](./phase-02-chrome-profile-discovery.md) |
| 3 | Chrome Launch + CDP | DONE | [phase-03](./phase-03-chrome-launch-cdp.md) |
| 4 | MCP Server + Tools | DONE | [phase-04](./phase-04-mcp-server-tools.md) |
| 5 | CLI Integration | DONE | [phase-05](./phase-05-cli-integration.md) |
| 6 | Testing + Polish | DONE | [phase-06](./phase-06-testing-polish.md) |

## Key Decisions
- Real Chrome binary (not Playwright Chromium) to preserve sessions/cookies/extensions
- Chrome path: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- CDP port: 9222 default, configurable via `--port`
- MCP transport: stdio (Claude Code/Desktop compatible)
- All logging to stderr (stdio safety)
- Screenshots as base64 image content
- `--user-data-dir` required for Chrome 136+ security

## MVP Tools (20 total)
**Navigation (8):** navigate, go_back, go_forward, reload, list_tabs, switch_tab, new_tab, close_tab
**Interaction (6):** click, type, scroll, hover, select_option, press_key
**Inspection (4):** screenshot, get_page_content, evaluate_js, wait_for

## User Workflow
1. `npx chrome-profile-mcp` - interactive mode
2. CLI lists Chrome profiles from Local State
3. User selects profile via arrow keys
4. Chrome launches with selected profile + CDP
5. Playwright connects via CDP
6. MCP server starts on stdio, AI-ready

## Dependencies
`@modelcontextprotocol/sdk` `playwright` `commander` `inquirer` `zod` `typescript` `tsx`

## Success Criteria
- [x] Profile discovery works on macOS
- [x] Chrome launches with correct profile + CDP enabled
- [x] Playwright connects and controls browser
- [x] All 20 MCP tools functional
- [x] Works with Claude Code via `.mcp.json`
- [x] Works with Claude Desktop via config
