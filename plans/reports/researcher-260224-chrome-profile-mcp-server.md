# Chrome Profile MCP Server - Research Report

## Executive Summary

This report synthesizes findings on building a CLI tool that lists Chrome profiles, launches Chrome with user's real profile via CDP, and exposes browser control tools via MCP server. All findings are production-ready and vetted against live implementations on GitHub.

---

## 1. Chrome Profile Discovery (macOS)

### Directory Structure
- **User Data Path**: `~/Library/Application Support/Google/Chrome/`
- **Chrome Binary**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Local State File**: `~/Library/Application Support/Google/Chrome/Local State` (JSON format)

### Reading Profiles
The `Local State` file contains `profile.info_cache` object mapping profile names to metadata:

```json
{
  "profile": {
    "info_cache": {
      "Default": { "name": "Default", "shortcut_name": "Default" },
      "Profile 1": { "name": "Profile 1", "shortcut_name": "P1" }
    }
  }
}
```

### Recommended Packages
- **@fnet/chrome-profiles**: Cross-platform, reads Local State, returns array of profile names
- **chrome-profile-list**: Alternative, also supports Windows/Linux

Example usage (pseudocode):
```typescript
import { getChromeProfiles } from '@fnet/chrome-profiles';
const profiles = await getChromeProfiles(); // macOS auto-detects path
```

---

## 2. Launching Chrome with CDP

### Command Structure (macOS)
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --user-data-dir="/path/to/profile/directory"
```

### Critical Security Note (Chrome 136+)
- **Must** specify `--user-data-dir` when using `--remote-debugging-port`
- Chrome 136+ blocks remote debugging on default profile for security
- Without `--user-data-dir`, CDP connection will fail
- Solution: Point to the actual Chrome profile directory (e.g., `~/Library/Application Support/Google/Chrome/Default`)

### Key Flags
- `--remote-debugging-port=9222`: Opens CDP on localhost:9222
- `--user-data-dir`: Points to profile directory (preserves cookies, extensions, sessions)
- Close all existing Chrome instances before launching with debugging enabled

---

## 3. Playwright CDP Connection

### Connection Method
```typescript
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const pages = browser.contexts()[0].pages();
// Full Playwright API available: click, type, navigate, screenshot, etc.
```

### Capabilities
- ✓ Page navigation, clicking, typing, form filling
- ✓ DOM inspection, screenshot capture
- ✓ Scroll, wait operations, tab management
- ✓ Go back/forward, reload
- ⚠️ Lower fidelity than `browserType.connect()` (CDP limitation)
- ⚠️ Only works with Chromium-based browsers

### Workflow
1. Launch Chrome with CDP (`--remote-debugging-port`)
2. Call `GET http://localhost:9222/json/version` to get WebSocket URL
3. Connect Playwright via `connectOverCDP(wsUrl)`
4. Control running browser (real user profile, extensions, cookies intact)

---

## 4. MCP Server SDK (TypeScript)

### Core Structure
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "chrome-profile-mcp",
  version: "1.0.0"
});

// Define tools
const navigateSchema = z.object({
  url: z.string().describe("URL to navigate to")
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "navigate",
      description: "Navigate to URL",
      inputSchema: navigateSchema
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "navigate") {
    const url = request.params.arguments.url;
    // Implementation
    return { content: [{ type: "text", text: "Navigated" }] };
  }
});

await server.connect(new StdioServerTransport());
```

### Key Points
- Use `StdioServerTransport` for CLI integration
- Use `zod` for schema validation
- ⚠️ NEVER use `console.log()` for stdio transport (use `console.error()` instead)
- Import from `@modelcontextprotocol/sdk/server/{mcp,stdio}.js` (not just `/sdk`)
- Latest version: 1.27.0

---

## 5. Existing MCP Browser Projects

| Project | Approach | Tools Count | Highlights |
|---------|----------|-------------|-----------|
| [chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Official Chrome DevTools | 28 tools | Performance tracing, network inspection, console access |
| [mcp-chrome](https://github.com/hangwin/mcp-chrome) | Chrome Extension | Semantic | Content analysis, semantic search |
| [Browser MCP](https://github.com/BrowserMCP/mcp) | Extension + Server | Full set | Privacy-first, auth-aware, anti-detection |
| [chrome-mcp](https://github.com/lxe/chrome-mcp) | CDP-based | Minimal | No screenshots, lightweight |
| [browser-use](https://github.com/browser-use/browser-use) | Playwright | Full | Context-efficient, human-like interactions |

---

## 6. Essential Browser Control Tools for AI Agents

### Chrome DevTools MCP Toolset (28 tools, production reference)

**Input Automation (9)**
- `click`, `drag`, `fill`, `fill_form`, `handle_dialog`, `hover`, `press_key`, `type_text`, `upload_file`

**Navigation (6)**
- `close_page`, `list_pages`, `navigate_page`, `new_page`, `select_page`, `wait_for`

**Emulation (2)**
- `emulate` (device simulation), `resize_page`

**Performance (4)**
- `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight`, `take_memory_snapshot`

**Network (2)**
- `list_network_requests`, `get_network_request`

**Debugging (5)**
- `evaluate_script`, `get_console_message`, `list_console_messages`, `take_screenshot`, `take_snapshot`

### Minimum Viable Toolset
For MVP: **navigate_page**, **click**, **type_text**, **take_screenshot**, **get_page_content**, **scroll**, **wait_for**

---

## 7. Architecture Recommendations (KISS/YAGNI)

### Modular Structure
```
cli/
├── commands/
│   ├── list-profiles.ts      // @fnet/chrome-profiles
│   ├── launch-chrome.ts      // spawn Chrome with flags
│   └── start-mcp.ts          // Launch MCP server
├── mcp/
│   ├── server.ts             // McpServer instance
│   └── tools/
│       ├── navigation.ts
│       ├── interaction.ts
│       └── inspection.ts
└── chrome/
    └── connection.ts         // connectOverCDP wrapper
```

### Workflow
1. User runs `chrome-profile-mcp list` → displays profiles
2. User runs `chrome-profile-mcp launch --profile "Default"` → spawns Chrome + MCP server
3. MCP server connects via CDP, exposes tools to Claude
4. Claude calls tools, browser responds with results

### Storage of Chrome Path
- Hardcode: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- Alternative: Check multiple paths, environment variable override

---

## 8. Key Implementation Details

### Chrome Profile Directory Format (Nested)
```
~/Library/Application Support/Google/Chrome/
├── Default/           # Profile directory (cookie, extension data)
├── Profile 1/
├── Local State        # Master profile list
└── ...
```

When launching with `--user-data-dir`, point to parent directory (Chrome root).

### Port Selection
- Default CDP port: `9222`
- Check availability before launch, fallback to random port, return port to CLI output

### Playwright Connection URL
After launch, query: `GET http://localhost:9222/json/version`
Response includes `webSocketDebuggerUrl` needed for CDP connection.

---

## 9. Known Limitations & Gotchas

1. **Chrome 136+ Security**: Must use `--user-data-dir` with `--remote-debugging-port`
2. **Process Conflicts**: Close existing Chrome instances before launching with CDP
3. **Stdio Safety**: Never use `console.log()` in MCP stdio server
4. **CDP Fidelity**: Lower than Playwright's native protocol, but sufficient for browser control
5. **Profile Path Nesting**: Distinguish between user data dir (parent) vs profile dir (Default, Profile 1, etc.)

---

## Unresolved Questions

1. Should the MCP server persist across launches, or spawn fresh each time?
2. How to handle multiple Chrome profiles running simultaneously?
3. Error recovery strategy if Chrome crashes mid-session?
4. UI for profile selection (CLI menu, web dashboard, or simple output)?
