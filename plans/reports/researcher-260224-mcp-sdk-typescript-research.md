# MCP SDK TypeScript/Node.js Research Report
**Date:** 260224
**Focus:** Latest SDK, transport types, tool patterns, best practices, Claude Code integration

---

## 1. @modelcontextprotocol/sdk - Latest Version & API

**Current Stable:** v1.26.0 (recommended for production)
**Upcoming:** v2 in Q1 2026 with extended support window

### Creating MCP Server
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

const server = new McpServer({
  name: "my-server",
  version: "1.0.0"
});

server.tool(
  "tool_name",
  { param1: z.string(), param2: z.number() },
  async (args) => ({
    content: [{ type: "text", text: "Result" }]
  })
);

server.start().catch(console.error);
```

**Key:** SDK requires Zod v4 as peer dependency. Transport via @modelcontextprotocol/node middleware for HTTP support.

---

## 2. Transport Types Comparison

| Transport | Latency | Claude Desktop | Claude Code | Use Case |
|-----------|---------|---|---|---|
| **stdio** | ~12ms | ✅ Only native | ✅ | Local servers (best default) |
| **SSE** | ~45ms | ❌ Deprecated | ✅ | Remote servers (legacy) |
| **HTTP Streamable** | Variable | 🚧 Coming | ✅ | Remote future standard (MCP 2025-03) |

**Decision:** Use **stdio** for local Claude Desktop integration. Use **HTTP Streamable** for remote/future-proof designs.

---

## 3. Tool Definition Pattern (Zod Schema)

```typescript
import { z } from "zod";

// Reusable schema
const QuerySchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email().optional()
}).refine(
  data => data.id || data.email,
  "At least one required"
);

server.tool("get_user", { query: QuerySchema }, async ({ query }) => {
  const user = await findUser(query);
  return {
    content: [{ type: "text", text: JSON.stringify(user) }]
  };
});
```

**Pattern:** Schema → TypeScript type via `z.infer<typeof QuerySchema>` → validated args in handler

---

## 4. Best Practices

### Error Handling
```typescript
// Wrong: Crashes server
server.tool("bad_tool", {}, async () => {
  throw new Error("Oops"); // Protocol error
});

// Right: Returns structured error
server.tool("good_tool", {}, async () => {
  try {
    // implementation
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err.message}` }],
      isError: true // Signal app-level error, not protocol error
    };
  }
});
```

**Key:** Stderr for logs, stdout for JSON-RPC only. Use `isError: true` for tool failures (not protocol errors).

### Tool Response Format
```typescript
// Text response
{ content: [{ type: "text", text: "Result" }] }

// Image response (base64)
{ content: [{
  type: "image",
  mimeType: "image/png",
  data: "base64_encoded_image_data"
}] }

// Mixed
{ content: [
  { type: "text", text: "Description" },
  { type: "image", mimeType: "image/png", data: "..." }
] }
```

**Yes, images supported:** MCP servers can return screenshots as base64 image content.

---

## 5. Claude Code Configuration

### Location & Format
Project scope: `.mcp.json` at repo root (shared with team)
User scope: Local Claude Code settings

### .mcp.json Example
```json
{
  "mcpServers": {
    "my-browser": {
      "type": "stdio",
      "command": "node",
      "args": ["./dist/server.js"],
      "env": { "DEBUG": "true" }
    },
    "remote-server": {
      "type": "sse",
      "url": "https://example.com/mcp"
    }
  }
}
```

### CLI Setup
```bash
# Add via CLI
claude mcp add-json my-server '[{"type":"stdio","command":"node","args":["./server.js"]}]'

# Env variable support
claude mcp add --env MCP_TIMEOUT=10000
```

**Config Scopes:** local (private) → project (`.mcp.json` shared) → user (global)

---

## 6. Claude Desktop Configuration

**File Location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

**Access:** Settings → Developer → Edit Config

**Format** (stdio only):
```json
{
  "mcpServers": {
    "my-tools": {
      "command": "npx",
      "args": ["-y", "@myorg/mcp-tools"],
      "env": { "API_KEY": "..." }
    }
  }
}
```

**⚠️ Limitation:** Claude Desktop currently supports **stdio only**. Remote/SSE requires workaround proxy.

---

## 7. Browser MCP Servers Landscape

### Playwright MCP (Microsoft)
**Tools exposed:** navigate, click, type, press_key, take_screenshot, wait_for, select_option, hover, evaluate_js, page_snapshot
**Status:** ~26 total tools available; recent versions have Claude Code integration issues
**Alternative:** ExecuteAutomation Playwright MCP (more stable)

### Screenshot MCP Servers
Multiple implementations available for AI agent vision:
- **Puppeteer-based:** Full page + element capture
- **Native OS tools:** Cross-platform system screenshots
- **macOS Peekaboo:** Lightning-fast specialized screenshots
- **Annotation:** Boxes, arrows, text markup support

### Key Tools Exposed (Browser Automation)
- navigate(url)
- click(selector)
- type(text)
- take_screenshot() / snapshot()
- evaluate_js(code)
- wait_for(selector)
- press_key(key)
- select_option(value)
- hover(selector)

---

## 8. Image Content in MCP

**Yes, fully supported.** Multiple screenshot MCP servers designed for AI agent vision workflows:
- Screenshot tools return base64-encoded PNG/JPG
- Clients (Claude, Cursor, etc.) display images inline
- Useful for: page snapshots, visual debugging, UI testing

---

## Key References

- [TypeScript SDK Releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- [MCP SDK Docs](https://modelcontextprotocol.io/docs/sdk)
- [Claude Code MCP Docs](https://code.claude.com/docs/en/mcp)
- [Error Handling Best Practices](https://mcpcat.io/guides/error-handling-custom-mcp-servers/)
- [Tool Definition Guide](https://mcpcat.io/guides/adding-custom-tools-mcp-server-typescript/)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Tool Response Spec](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)

---

## Unresolved Questions

1. Does Claude Desktop plan to support HTTP Streamable transport in v2 MCP release?
2. Will v2 MCP SDK have breaking changes requiring migration from v1?
3. Are there performance optimizations in SDK v2 for tool response streaming?
4. Does SSE transport deprecation mean zero future support?
