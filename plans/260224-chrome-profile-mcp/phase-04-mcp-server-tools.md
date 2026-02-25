# Phase 4: MCP Server + Browser Tools

## Context
Core phase. MCP server exposes 20 browser control tools over stdio transport. Playwright page reference shared across tools. Research confirms `server.tool()` API with Zod schemas and `isError` pattern.

## Overview
Create MCP server with 20 tools across 3 categories: navigation (8), interaction (6), inspection (4).

## Requirements
- MCP server via `@modelcontextprotocol/sdk` with stdio transport
- Zod schemas for all tool inputs
- All errors returned as `{ isError: true }` (never throw)
- Screenshots as base64 image content
- Active page tracking for multi-tab support
- All `console.log` replaced with `console.error` (stdio safety)

## Implementation Steps

### 4.1 MCP server setup (`src/mcp/server.ts`)

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Browser, BrowserContext, Page } from "playwright";
import { registerNavigationTools } from "./tools/navigation.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { log } from "../utils/logger.js";

export async function createMcpServer(
  browser: Browser,
  context: BrowserContext,
  initialPage: Page
): Promise<McpServer> {
  const server = new McpServer({
    name: "chrome-profile-mcp",
    version: "0.1.0",
  });

  // Shared state: active page reference
  const state = { page: initialPage, context, browser };

  registerNavigationTools(server, state);
  registerInteractionTools(server, state);
  registerInspectionTools(server, state);

  return server;
}

export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server started on stdio");
}
```

### 4.2 Shared state type

```typescript
// src/mcp/types.ts
import { Browser, BrowserContext, Page } from "playwright";

export interface BrowserState {
  page: Page;
  context: BrowserContext;
  browser: Browser;
}
```

### 4.3 Navigation tools (`src/mcp/tools/navigation.ts`)

**8 tools:**

| Tool | Schema | Description |
|------|--------|-------------|
| `navigate` | `{ url: string }` | Navigate active tab to URL |
| `go_back` | `{}` | Go back in history |
| `go_forward` | `{}` | Go forward in history |
| `reload` | `{}` | Reload current page |
| `list_tabs` | `{}` | List all open tabs with URLs |
| `switch_tab` | `{ index: number }` | Switch active tab by index |
| `new_tab` | `{ url?: string }` | Open new tab, optionally with URL |
| `close_tab` | `{ index?: number }` | Close tab by index (default: active) |

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { BrowserState } from "../types.js";

export function registerNavigationTools(server: McpServer, state: BrowserState) {

  server.tool("navigate", { url: z.string().describe("URL to navigate to") },
    async ({ url }) => {
      try {
        await state.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const title = await state.page.title();
        return { content: [{ type: "text", text: `Navigated to: ${url}\nTitle: ${title}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("go_back", {},
    async () => {
      try {
        await state.page.goBack({ waitUntil: "domcontentloaded" });
        return { content: [{ type: "text", text: `Went back to: ${state.page.url()}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("go_forward", {},
    async () => {
      try {
        await state.page.goForward({ waitUntil: "domcontentloaded" });
        return { content: [{ type: "text", text: `Went forward to: ${state.page.url()}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("reload", {},
    async () => {
      try {
        await state.page.reload({ waitUntil: "domcontentloaded" });
        return { content: [{ type: "text", text: `Reloaded: ${state.page.url()}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("list_tabs", {},
    async () => {
      const pages = state.context.pages();
      const tabs = pages.map((p, i) => `[${i}] ${p.url()} - ${p === state.page ? "(active)" : ""}`);
      return { content: [{ type: "text", text: tabs.join("\n") }] };
    }
  );

  server.tool("switch_tab", { index: z.number().describe("Tab index (0-based)") },
    async ({ index }) => {
      const pages = state.context.pages();
      if (index < 0 || index >= pages.length) {
        return { content: [{ type: "text", text: `Invalid tab index. ${pages.length} tabs open.` }], isError: true };
      }
      state.page = pages[index];
      await state.page.bringToFront();
      return { content: [{ type: "text", text: `Switched to tab ${index}: ${state.page.url()}` }] };
    }
  );

  server.tool("new_tab", { url: z.string().optional().describe("URL to open (optional)") },
    async ({ url }) => {
      try {
        const newPage = await state.context.newPage();
        if (url) await newPage.goto(url, { waitUntil: "domcontentloaded" });
        state.page = newPage;
        return { content: [{ type: "text", text: `New tab opened${url ? `: ${url}` : ""}` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool("close_tab", { index: z.number().optional().describe("Tab index to close (default: active)") },
    async ({ index }) => {
      try {
        const pages = state.context.pages();
        const target = index !== undefined ? pages[index] : state.page;
        if (!target) return { content: [{ type: "text", text: "Invalid tab index" }], isError: true };
        await target.close();
        // Update active page if closed
        const remaining = state.context.pages();
        if (remaining.length > 0) state.page = remaining[0];
        return { content: [{ type: "text", text: `Closed tab. ${remaining.length} remaining.` }] };
      } catch (err: any) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
```

### 4.4 Interaction tools (`src/mcp/tools/interaction.ts`)

**6 tools:**

| Tool | Schema | Description |
|------|--------|-------------|
| `click` | `{ selector: string }` | Click element by CSS selector |
| `type` | `{ selector: string, text: string }` | Type text into input |
| `scroll` | `{ direction?: "up"\|"down", amount?: number, selector?: string }` | Scroll page or element |
| `hover` | `{ selector: string }` | Hover over element |
| `select_option` | `{ selector: string, value: string }` | Select dropdown option |
| `press_key` | `{ key: string }` | Press keyboard key |

Key implementation notes:
- `click`: Use `page.click(selector)` with 5s timeout
- `type`: Use `page.fill(selector, text)` for inputs, `page.type()` for non-input elements
- `scroll`: Use `page.evaluate()` with `window.scrollBy()` or `element.scrollIntoView()`
- `hover`: Use `page.hover(selector)`
- `select_option`: Use `page.selectOption(selector, value)`
- `press_key`: Use `page.keyboard.press(key)`

All wrapped in try/catch returning `isError: true` on failure.

### 4.5 Inspection tools (`src/mcp/tools/inspection.ts`)

**4 tools:**

| Tool | Schema | Description |
|------|--------|-------------|
| `screenshot` | `{ fullPage?: boolean, selector?: string }` | Capture screenshot |
| `get_page_content` | `{ selector?: string }` | Get page HTML or text content |
| `evaluate_js` | `{ code: string }` | Execute JavaScript in page |
| `wait_for` | `{ selector: string, timeout?: number }` | Wait for element to appear |

Key implementation notes:
- `screenshot`: Use `page.screenshot({ encoding: "base64" })`. Return as `{ type: "image", mimeType: "image/png", data: base64 }`.
  - Optional `selector` for element screenshot: `page.locator(selector).screenshot()`
  - Optional `fullPage` for full page capture
- `get_page_content`: Use `page.content()` for full HTML, or `page.locator(selector).textContent()` for specific element. Truncate to 50K chars to avoid overwhelming context.
- `evaluate_js`: Use `page.evaluate(code)`. Serialize result to JSON string.
- `wait_for`: Use `page.waitForSelector(selector, { timeout })`. Default timeout 10s.

### 4.6 Tool helper pattern
Extract common error wrapper:

```typescript
// src/mcp/tools/helpers.ts
type ToolResult = { content: Array<{ type: string; [key: string]: any }>; isError?: boolean };

export async function safeTool(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true,
    };
  }
}
```

## Todo
- [ ] Create BrowserState type
- [ ] Create MCP server factory (createMcpServer)
- [ ] Create safeTool helper
- [ ] Implement 8 navigation tools
- [ ] Implement 6 interaction tools
- [ ] Implement 4 inspection tools
- [ ] Verify screenshot returns base64 image content
- [ ] Test all tools against live Chrome
- [ ] Verify no console.log anywhere (only console.error)

## Success Criteria
- All 20 tools registered and callable via MCP protocol
- Screenshots returned as base64 image content type
- Errors return `isError: true` (never crash server)
- Tab switching updates shared page reference correctly
- Stdio transport works (no stdout pollution)
