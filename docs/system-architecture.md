# System Architecture

## High-Level Flow

```
User Invocation
    ↓
┌─────────────────────────────────────────────┐
│ CLI (cli.ts)                                 │
│ - Parse args (--profile, --port, --debug)   │
│ - Platform guard (macOS only)                │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Profile Discovery (discover-profiles.ts)    │
│ - Read Chrome Local State JSON               │
│ - Parse profile.info_cache                  │
│ - Return list with names & paths            │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Profile Selection                            │
│ - Interactive: inquirer prompt               │
│ - Non-interactive: --profile flag match      │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Chrome Launch (launch-chrome.ts)             │
│ - Check port availability                    │
│ - Try existing CDP first                    │
│ - spawn() Chrome with:                       │
│   --remote-debugging-port=$port              │
│   --user-data-dir=$userDataDir               │
│   --profile-directory=$profileDir            │
│ - Poll CDP /json/version until ready         │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ CDP Connection (connect-cdp.ts)              │
│ - chromium.connectOverCDP(cdpUrl)            │
│ - Extract first context & first page         │
│ - Return {browser, context, page}            │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Cleanup Handlers (launch-chrome.ts)          │
│ - Register SIGINT/SIGTERM                   │
│ - Graceful browser.close() + process.kill()  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ MCP Server Init (server.ts)                  │
│ - new McpServer({name, version})             │
│ - registerNavigationTools()                  │
│ - registerInteractionTools()                 │
│ - registerInspectionTools()                  │
└─────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────┐
│ Start Server (server.ts)                     │
│ - new StdioServerTransport()                 │
│ - server.connect(transport)                  │
│ - Listening on stdin/stdout                  │
└─────────────────────────────────────────────┘
    ↓
Agent calls tools via stdio → MCP protocol
```

## Data Flow

1. **User → CLI:** `npx chrome-profile-mcp --profile Default --port 9222`
2. **CLI → Discovery:** Read `~/.config/google-chrome/Local State`
3. **Discovery → Selection:** User picks profile (or pre-specified)
4. **Selection → Launch:** spawn Chrome process with CDP port
5. **Launch → Connect:** Poll CDP endpoint, get WebSocket URL
6. **Connect → Playwright:** `chromium.connectOverCDP(wsUrl)`
7. **Playwright → MCP Server:** Create server instance with {browser, context, page}
8. **MCP Server → Agent:** Register 18 tools, start stdio transport
9. **Agent → Tools:** Each tool wraps Playwright calls + error handling
10. **Tools → Chrome:** Playwright CDP protocol → browser actions

## Architecture Decisions

### Decision 1: Real Chrome (not Chromium Bundling)
**Why:** Reuse user's profiles, cookies, extensions, login sessions
**Trade-off:** Requires Chrome installed + hardcoded path (macOS only for now)

### Decision 2: Stdio Transport (not HTTP)
**Why:** MCP standard for Claude Code/Desktop agents
**Trade-off:** Single process per agent; no concurrent sessions (intended)

### Decision 3: Stderr for Logging (not stdout)
**Why:** stdout reserved for MCP stdio protocol
**Trade-off:** Logs in console.error; agents/IDEs may not show nicely

### Decision 4: Playwright CDP (not raw CDP client)
**Why:** Abstracts protocol, provides high-level APIs (click, type, etc.)
**Trade-off:** ~20KB overhead; slightly higher latency than raw CDP

### Decision 5: Single Context + Page Model
**Why:** Simplifies state management
**Trade-off:** Agents switch tabs via `switch_tab`; no multi-context isolation

### Decision 6: Port Reuse (try existing CDP first)
**Why:** Prevents zombie processes if Chrome already running
**Trade-off:** May reuse stale session; user must close manually

## Key Components

### cli.ts
- Entry point
- Argument parsing (Commander)
- Orchestration: discovery → selection → launch → connect → server
- Error handling & exit codes

### discover-profiles.ts
- Read Chrome's `Local State` JSON
- Parse `profile.info_cache` object
- Return `ChromeProfile[]` with directoryName, displayName, profilePath

### launch-chrome.ts
- Check port availability
- Try existing CDP endpoint
- spawn() Chrome with args
- Poll `/json/version` until CDP ready (timeout: 15s)
- Setup SIGINT/SIGTERM handlers
- Return `{process, port, cdpUrl}`

### connect-cdp.ts
- `chromium.connectOverCDP(cdpUrl)`
- Extract first browser context
- Get/create first page
- Return `{browser, context, page}`

### server.ts
- Create `McpServer` instance
- Register all tool modules
- Create `StdioServerTransport`
- Connect server to transport

### tools/navigation.ts
- 8 tools: navigate, go_back, go_forward, reload, list_tabs, switch_tab, new_tab, close_tab
- Update shared `state.page` on tab switches

### tools/interaction.ts
- 6 tools: click, type, scroll, hover, select_option, press_key
- All use `state.page.locator(selector)` or direct keyboard/mouse

### tools/inspection.ts
- 4 tools: screenshot, get_page_content, evaluate_js, wait_for
- screenshot returns base64 PNG
- get_page_content truncates at 50K chars
- evaluate_js has 10s timeout

### safe-tool-wrapper.ts
- Wraps all tool handlers in try/catch
- Returns `{content: [{type: "text", text: errorMsg}], isError: true}` on failure
- Prevents server crashes

### logger.ts
- Stderr-only logging
- Respects DEBUG env var
- No console.log() (reserves stdout for MCP)

## State Management

**Shared `BrowserState` object passed to all tool handlers:**
```typescript
interface BrowserState {
  page: Page;           // Active page (mutable)
  context: BrowserContext;
  browser: Browser;
}
```

- `page` is mutated when switching tabs or opening new tabs
- `context` and `browser` are read-only
- No per-tool state; all state in shared object

## Error Handling Strategy

1. **Launch errors:** Throw immediately, exit(1)
2. **Tool errors:** Catch in `safeTool()`, return MCP error response
3. **Process shutdown:** Handlers for SIGINT/SIGTERM (graceful)
4. **Cleanup:** Always run on exit (kill process, close browser)

## Platform Constraints

- **macOS only:** Chrome path hardcoded (`/Applications/Google Chrome.app/...`)
- **Future:** Detect Chrome on Linux/Windows
- **Profile paths:** macOS: `~/Library/Application Support/Google/Chrome`

---

*Last Updated: 2025-02-24*
