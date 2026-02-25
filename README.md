# Chrome Profile MCP Server

MCP server that launches Chrome with a specific user profile and exposes browser control tools via the Model Context Protocol. AI agents (Claude Code, Claude Desktop, etc.) can then navigate, click, type, take screenshots, and more — all using your real Chrome sessions, cookies, and extensions.

## Quick Start

```bash
# Interactive mode — pick a profile
npx chrome-profile-mcp

# Non-interactive — specify profile directly
npx chrome-profile-mcp --profile "Default"
```

## CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --profile <name>` | Chrome profile directory name (skip selection) | interactive |
| `--port <number>` | CDP debugging port | `9222` |
| `--debug` | Enable debug logging | off |

## Claude Code Integration

Add to `.mcp.json` in your project root:

```json
{
  "mcpServers": {
    "chrome": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "chrome-profile-mcp", "--profile", "Default"]
    }
  }
}
```

Or with a local build:

```json
{
  "mcpServers": {
    "chrome": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/chrome-profile-mcp/dist/cli.js", "--profile", "Default"]
    }
  }
}
```

## Claude Desktop Integration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "chrome-browser": {
      "command": "node",
      "args": ["/path/to/chrome-profile-mcp/dist/cli.js", "--profile", "Default"]
    }
  }
}
```

> **Note:** `--profile` is required for Claude Code/Desktop since there's no TTY for interactive selection.

## Available Tools (18)

### Navigation (8)
| Tool | Description |
|------|-------------|
| `navigate` | Navigate active tab to a URL |
| `go_back` | Go back in browser history |
| `go_forward` | Go forward in browser history |
| `reload` | Reload current page |
| `list_tabs` | List all open tabs with URLs |
| `switch_tab` | Switch active tab by index |
| `new_tab` | Open new tab (optionally with URL) |
| `close_tab` | Close tab by index (default: active) |

### Interaction (6)
| Tool | Description |
|------|-------------|
| `click` | Click element by CSS selector |
| `type` | Type text into input element |
| `scroll` | Scroll page or element into view |
| `hover` | Hover over element |
| `select_option` | Select dropdown option |
| `press_key` | Press keyboard key |

### Inspection (4)
| Tool | Description |
|------|-------------|
| `screenshot` | Capture page/element screenshot (returns PNG) |
| `get_page_content` | Get page HTML or element text |
| `evaluate_js` | Execute JavaScript in page context |
| `wait_for` | Wait for element to appear |

## How It Works

1. Reads Chrome's `Local State` to discover available profiles
2. Launches Chrome with `--remote-debugging-port` using the selected profile
3. Connects via Chrome DevTools Protocol (CDP) using Playwright
4. Starts an MCP server on stdio that exposes 20 browser control tools
5. AI agents call tools to control your real Chrome browser

## Requirements

- macOS (Chrome path hardcoded to `/Applications/Google Chrome.app`)
- Google Chrome installed (launched at least once)
- Node.js 18+

## Known Limitations

- macOS only (Linux/Windows paths not yet supported)
- Chrome must not already be running with `--remote-debugging-port` on the same port
- CDP has lower fidelity than Playwright's native protocol for some operations
- `get_page_content` truncates at 50K chars to prevent context overflow

## Development

```bash
npm install
npm run build
npm run dev          # Run with tsx (interactive mode)
npm run dev -- --profile Default  # Non-interactive
```

## License

MIT
