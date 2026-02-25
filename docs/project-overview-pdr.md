# Chrome Profile MCP Server - Project Overview & PDR

## Project Description

**Chrome Profile MCP Server** launches a real Chrome browser instance with a user-selected profile and exposes 18 browser control tools via the Model Context Protocol (MCP). AI agents (Claude Code, Claude Desktop, etc.) can navigate, interact, and inspect the browser without Chromium bundling or external APIs.

**Target Platform:** macOS
**Tech Stack:** TypeScript, Playwright (CDP), MCP SDK 0.4+, Commander CLI

## Core Features

### Browser Control Tools (18)
- **Navigation (8):** navigate, go_back, go_forward, reload, list_tabs, switch_tab, new_tab, close_tab
- **Interaction (6):** click, type, scroll, hover, select_option, press_key
- **Inspection (4):** screenshot, get_page_content, evaluate_js, wait_for

### Integration Modes
- **Interactive:** CLI profile picker for local development
- **Non-Interactive:** `--profile` flag for Claude Code/Desktop config
- **Transport:** stdio (MCP standard for desktop agents)

## Functional Requirements

| Req | Description | Status |
|-----|-------------|--------|
| FR-1 | Discover all Chrome profiles from Local State | Done |
| FR-2 | Launch Chrome with selected profile + CDP port | Done |
| FR-3 | Connect Playwright over CDP | Done |
| FR-4 | Register 18 MCP tools on server startup | Done |
| FR-5 | Support tab management (list, switch, new, close) | Done |
| FR-6 | Support DOM interaction (click, type, scroll, hover, select, keypress) | Done |
| FR-7 | Support inspection (screenshot, HTML, JS eval, wait) | Done |
| FR-8 | Graceful shutdown with process cleanup | Done |

## Non-Functional Requirements

| Req | Description |
|-----|-------------|
| NFR-1 | Reuse existing Chrome session if CDP already running on port |
| NFR-2 | Stderr-only logging (preserve stdout for stdio MCP transport) |
| NFR-3 | Tool error handling via safeTool wrapper (no crashes) |
| NFR-4 | Content truncation at 50K chars (prevent context overflow) |
| NFR-5 | 30s navigate timeout, 5s interaction timeout, 10s JS eval timeout |
| NFR-6 | Port availability check before launch |
| NFR-7 | SIGINT/SIGTERM cleanup handlers |

## Success Metrics

- All 18 tools callable from Claude Code/Desktop
- Profile discovery & selection < 2s
- Chrome launch + CDP connect < 5s
- Graceful shutdown on process termination
- No stdout pollution (MCP compatibility)

## Constraints & Decisions

1. **Real Chrome Only:** Uses system Chrome (not Chromium bundled). Path hardcoded: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. **macOS Only:** Chrome paths not yet abstracted for Linux/Windows
3. **Stdio Transport:** No HTTP server; integrates directly with Claude Code/Desktop
4. **Single Context:** First browser context used (Chrome's default)
5. **Single Page:** First page used; agents switch tabs via `switch_tab`
6. **CDP Priority:** Reuses running CDP if available on port (prevents zombie processes)

## Dependencies

- `@modelcontextprotocol/sdk` ^0.4.0
- `playwright` ^1.48.0
- `commander` ^12.0.0
- `@inquirer/prompts` ^6.1.0
- `zod` ^3.23.0

## File Structure

```
src/
├── cli.ts                  # Entry point, orchestration
├── chrome/
│   ├── discover-profiles.ts
│   ├── launch-chrome.ts
│   └── connect-cdp.ts
├── mcp/
│   ├── server.ts
│   ├── types.ts
│   └── tools/
│       ├── navigation.ts
│       ├── interaction.ts
│       ├── inspection.ts
│       └── safe-tool-wrapper.ts
└── utils/
    └── logger.ts
```

## Known Limitations

- macOS only (Linux/Windows in roadmap)
- Chrome must not already run with same CDP port
- Content truncation at 50K chars
- Tab switching via index only (not by name/URL yet)

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1.0 | 2025-02-24 | Initial release. 18 tools, profile discovery, CDP connection |

---

*Last Updated: 2025-02-24*
