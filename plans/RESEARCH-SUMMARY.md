# Chrome Profile MCP Server - Research Summary

## Quick Reference

### Files Generated
1. **researcher-260224-chrome-profile-mcp-server.md** - Comprehensive research report (9 sections)
2. **implementation-snippets.md** - Production-ready code examples
3. **RESEARCH-SUMMARY.md** - This quick reference guide

---

## Critical Implementation Path

### 1. Profile Discovery
```bash
→ Read: ~/Library/Application Support/Google/Chrome/Local State
→ Parse: profile.info_cache object
→ Use: @fnet/chrome-profiles package (recommended)
```

### 2. Launch Chrome
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir=~/Library/Application\ Support/Google/Chrome \
  --profile-directory=Default
```

**CRITICAL (Chrome 136+)**: Must include `--user-data-dir` when using CDP.

### 3. Connect via Playwright
```typescript
const response = await fetch('http://localhost:9222/json/version');
const { webSocketDebuggerUrl } = await response.json();
const browser = await chromium.connectOverCDP(webSocketDebuggerUrl);
```

### 4. Start MCP Server (Stdio)
```typescript
const server = new McpServer({ name: "chrome-mcp", version: "1.0.0" });
server.setRequestHandler(ListToolsRequestSchema, ...);
server.setRequestHandler(CallToolRequestSchema, ...);
await server.connect(new StdioServerTransport());
```

---

## Minimum Viable Tools (MVP)

For MVP, expose these 7 tools via MCP:
1. `navigate_page` - Go to URL
2. `click` - Click element
3. `type_text` - Type text
4. `screenshot` - Capture screen
5. `get_page_content` - Read DOM
6. `scroll` - Scroll page
7. `wait_for` - Wait for condition

Reference: Chrome DevTools MCP has 28 tools (production example).

---

## Tech Stack Decision

| Component | Choice | Reason |
|-----------|--------|--------|
| Profile Discovery | @fnet/chrome-profiles | Minimal, cross-platform |
| Chrome Launch | child_process.spawn | Simple, no dependencies |
| Browser Control | Playwright CDP | Maturity, Chromium support |
| MCP Server | @modelcontextprotocol/sdk v1.27.0 | Official, well-tested |
| Transport | StdioServerTransport | CLI integration |
| Validation | zod | Schema safety |
| CLI | commander.js | Standard, user-friendly |

---

## Key Security & Compatibility Notes

### Chrome 136+ Breaking Change
- `--remote-debugging-port` alone no longer works
- Requires `--user-data-dir` pointing to valid Chrome data directory
- Prevents attackers from exploiting CDP on default profile
- **MUST implement before production**

### Stdio Transport Gotcha
- ❌ Never use `console.log()` - corrupts JSON-RPC
- ✅ Use `console.error()` for logging
- ✅ Use stderr-based logging library

### Port Selection
- Default: 9222
- Check availability, fallback to random port
- Return port to CLI output for user reference

---

## Architecture Overview

```
vibe-mcp-chrome/
├── src/
│   ├── cli.ts              # Commander entry point
│   ├── commands/
│   │   ├── list.ts         # List Chrome profiles
│   │   └── launch.ts       # Launch + start MCP
│   ├── chrome/
│   │   ├── profiles.ts     # Profile discovery
│   │   ├── launcher.ts     # Chrome process management
│   │   └── connection.ts   # CDP connection wrapper
│   └── mcp/
│       ├── server.ts       # McpServer instance
│       └── tools/
│           ├── navigation.ts
│           ├── interaction.ts
│           └── inspection.ts
├── dist/                   # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

---

## Development Checklist

- [ ] Install dependencies: `npm install`
- [ ] Test profile listing with actual Chrome profiles
- [ ] Verify Chrome launch with `--user-data-dir` (not just `--profile-directory`)
- [ ] Test CDP connection on localhost:9222
- [ ] Implement 7 MVP tools with Playwright
- [ ] Test MCP stdio output (no console.log corruption)
- [ ] Test with Chrome 136+ (critical security update)
- [ ] Add error handling for port conflicts
- [ ] Add graceful Chrome shutdown on MCP server exit
- [ ] Document CLI usage in README

---

## Known Gaps & Risks

| Issue | Impact | Mitigation |
|-------|--------|-----------|
| Chrome 136+ requirement | Breaking on older versions | Document minimum version, add version check |
| Port conflicts | MCP won't start if 9222 busy | Auto-select random port if busy |
| Process management | Orphaned Chrome if crash | Implement signal handlers, process cleanup |
| Profile path nesting | User data dir vs profile dir confusion | Clear documentation, validation |
| Stdio safety | MCP corruption from logging | Enforce console.error() use |

---

## Sources

- [Chromium User Data Directory Docs](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md)
- [Chrome Remote Debugging Security Changes](https://developer.chrome.com/blog/remote-debugging-port)
- [@modelcontextprotocol/sdk v1.27.0](https://www.npmjs.com/package/@modelcontextprotocol/sdk)
- [Playwright connectOverCDP Docs](https://playwright.dev/docs/api/class-browsertype)
- [Chrome DevTools MCP (GitHub)](https://github.com/ChromeDevTools/chrome-devtools-mcp)
- [Browser MCP Reference](https://github.com/BrowserMCP/mcp)
- [@fnet/chrome-profiles](https://www.npmjs.com/package/@fnet/chrome-profiles)

---

## Next Steps

1. **Read the full research report** (`researcher-260224-chrome-profile-mcp-server.md`)
2. **Review implementation snippets** (`implementation-snippets.md`)
3. **Begin with profile discovery** - validate that you can read local Chrome profiles
4. **Test Chrome launch** - ensure CDP port responds correctly
5. **Build minimal MCP server** - start with 3 tools (navigate, click, screenshot)
6. **Expand tool set** - add remaining 4 MVP tools
7. **Test with Claude** - integrate with Claude Code once basic tools work
