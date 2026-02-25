# Codebase Summary

## File Inventory (11 source files)

### 1. `src/cli.ts` (117 lines)
**Purpose:** CLI entry point & orchestration
**Exports:** `run(opts)` function
**Key Logic:**
- Parses args: `--profile`, `--port`, `--debug`
- Platform guard (macOS only)
- Port validation
- Orchestrates: discover → select → launch → connect → server

### 2. `src/chrome/discover-profiles.ts` (63 lines)
**Purpose:** Profile discovery from Chrome Local State
**Exports:** `discoverProfiles()`, `getChromeUserDataDir()`
**Key Logic:**
- Reads `~/Library/Application Support/Google/Chrome/Local State`
- Parses JSON, extracts `profile.info_cache`
- Returns `ChromeProfile[]` with displayName priority: gaia_name > name > shortcut_name > dirName
- Handles ENOENT (Chrome not installed)

### 3. `src/chrome/launch-chrome.ts` (148 lines)
**Purpose:** Chrome process spawning & lifecycle
**Exports:** `launchChrome()`, `setupCleanup()`
**Key Logic:**
- Check port availability (TCP bind test)
- Try existing CDP first (reuse if running)
- spawn() Chrome: `/Applications/Google Chrome.app/...`
- Args: `--remote-debugging-port`, `--user-data-dir`, `--profile-directory`, `--no-first-run`
- Poll `/json/version` endpoint (timeout 15s)
- SIGINT/SIGTERM handlers → graceful browser.close() + process.kill()

### 4. `src/chrome/connect-cdp.ts` (34 lines)
**Purpose:** Playwright-over-CDP connection
**Exports:** `connectCDP()`
**Key Logic:**
- `chromium.connectOverCDP(cdpUrl)` connects to running Chrome
- Extract first context from browser.contexts()
- Get/create first page
- Return `{browser, context, page}`

### 5. `src/mcp/server.ts` (41 lines)
**Purpose:** MCP server setup & tool registration
**Exports:** `createMcpServer()`, `startServer()`
**Key Logic:**
- Create `McpServer({name: "chrome-profile-mcp", version: "0.1.0"})`
- Create shared `BrowserState`
- Register 3 tool modules (navigation, interaction, inspection)
- Create `StdioServerTransport`, connect server
- Log "18 tools registered" on init

### 6. `src/mcp/types.ts` (8 lines)
**Purpose:** Shared TypeScript interfaces
**Exports:** `BrowserState`
**Content:**
- `page`: Playwright Page (mutable on tab switch)
- `context`: Playwright BrowserContext (read-only)
- `browser`: Playwright Browser (read-only)

### 7. `src/mcp/tools/navigation.ts` (199 lines)
**Purpose:** Tab & navigation control (8 tools)
**Exports:** `registerNavigationTools()`
**Tools:**
- `navigate(url)` → goto with 30s timeout
- `go_back()` / `go_forward()` → history navigation
- `reload()` → refresh page
- `list_tabs()` → enumerate all pages with active marker
- `switch_tab(index)` → update state.page, bringToFront()
- `new_tab(url?)` → newPage(), optionally navigate
- `close_tab(index?)` → close by index or active, fallback to first page

### 8. `src/mcp/tools/interaction.ts` (159 lines)
**Purpose:** DOM & keyboard interaction (6 tools)
**Exports:** `registerInteractionTools()`
**Tools:**
- `click(selector)` → page.click() with 5s timeout
- `type(selector, text)` → page.fill() (clears then types)
- `scroll(direction?, amount?, selector?)` → element scroll-into-view or window.scrollBy()
- `hover(selector)` → page.hover() with 5s timeout
- `select_option(selector, value)` → page.selectOption()
- `press_key(key)` → page.keyboard.press() (Enter, Tab, Escape, Arrow*, etc.)

### 9. `src/mcp/tools/inspection.ts` (139 lines)
**Purpose:** Page inspection & JS execution (4 tools)
**Exports:** `registerInspectionTools()`
**Tools:**
- `screenshot(fullPage?, selector?)` → base64 PNG (element or viewport/full-page)
- `get_page_content(selector?)` → HTML or element text, truncated at 50K chars
- `evaluate_js(code)` → execute JS in page context, return JSON with 10s timeout
- `wait_for(selector, timeout?)` → waitForSelector, default 10s timeout

### 10. `src/mcp/tools/safe-tool-wrapper.ts` (22 lines)
**Purpose:** Error handling wrapper for all tools
**Exports:** `safeTool()`
**Logic:**
- Try/catch wrapper
- On error: return `{content: [{type: "text", text: "Error: ..."}], isError: true}`
- Prevents tool crashes from crashing server

### 11. `src/utils/logger.ts` (10 lines)
**Purpose:** Stderr-only logging
**Exports:** `log` object
**Methods:**
- `log.info()`, `log.warn()`, `log.error()` → console.error() (not console.log)
- `log.debug()` → only if DEBUG=1 env var set
- Preserves stdout for MCP stdio transport

## Tool Count

- **Navigation:** 8 tools
- **Interaction:** 6 tools
- **Inspection:** 4 tools
- **Total:** 18 tools

## Dependency Graph

```
cli.ts
├─ discover-profiles.ts
├─ launch-chrome.ts
│  └─ logger.ts
├─ connect-cdp.ts
│  └─ logger.ts
├─ server.ts
│  ├─ navigation.ts
│  │  └─ safe-tool-wrapper.ts
│  ├─ interaction.ts
│  │  └─ safe-tool-wrapper.ts
│  ├─ inspection.ts
│  │  └─ safe-tool-wrapper.ts
│  ├─ logger.ts
│  └─ types.ts
└─ logger.ts
```

## Code Stats

| File | Lines | Type |
|------|-------|------|
| cli.ts | 117 | Orchestration |
| discover-profiles.ts | 63 | Chrome integration |
| launch-chrome.ts | 148 | Chrome integration |
| connect-cdp.ts | 34 | Browser connection |
| server.ts | 41 | MCP setup |
| types.ts | 8 | Types |
| navigation.ts | 199 | Tools |
| interaction.ts | 159 | Tools |
| inspection.ts | 139 | Tools |
| safe-tool-wrapper.ts | 22 | Error handling |
| logger.ts | 10 | Logging |
| **Total** | **940** | |

---

*Last Updated: 2025-02-24*
