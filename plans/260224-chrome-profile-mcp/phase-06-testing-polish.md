# Phase 6: Testing + Polish

## Context
Final phase. Validate everything works end-to-end, add configuration examples for Claude Code and Claude Desktop, write README.

## Overview
Manual testing, Claude integration config, error hardening, and documentation.

## Requirements
- End-to-end test of full workflow
- `.mcp.json` example for Claude Code
- `claude_desktop_config.json` example for Claude Desktop
- README with usage instructions
- Edge case handling

## Implementation Steps

### 6.1 End-to-end manual test plan
1. Run `npm run dev` -- verify profile list appears
2. Select profile -- verify Chrome launches with CDP
3. Check Chrome has correct profile (cookies, bookmarks visible)
4. Verify MCP server starts (no stdout pollution)
5. Test each tool category:
   - `navigate` to example.com
   - `screenshot` -- verify base64 PNG returned
   - `click` on a link
   - `type` into search box
   - `list_tabs`, `new_tab`, `switch_tab`, `close_tab`
   - `go_back`, `go_forward`, `reload`
   - `scroll` down/up
   - `hover` over element
   - `evaluate_js` -- run `document.title`
   - `wait_for` -- wait for selector
   - `press_key` -- press Enter
   - `select_option` on a dropdown
   - `get_page_content` -- verify HTML returned
6. Ctrl+C -- verify Chrome process killed

### 6.2 Claude Code integration (`.mcp.json`)
```json
{
  "mcpServers": {
    "chrome-profile-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/dist/cli.js", "--profile", "Default"],
      "env": {}
    }
  }
}
```

Note: `--profile` required for non-interactive mode in Claude Code (no TTY for inquirer).

### 6.3 Claude Desktop integration
`~/Library/Application Support/Claude/claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "chrome-browser": {
      "command": "node",
      "args": ["/absolute/path/to/dist/cli.js", "--profile", "Default"]
    }
  }
}
```

### 6.4 npx usage (after npm publish)
```json
{
  "mcpServers": {
    "chrome-browser": {
      "command": "npx",
      "args": ["-y", "chrome-profile-mcp", "--profile", "Default"]
    }
  }
}
```

### 6.5 Error hardening
- Validate Chrome binary exists before spawn
- Timeout on CDP connection with clear message
- Handle page close events (update active page)
- Handle browser disconnect gracefully
- Handle `context.pages()` returning empty array
- Truncate `get_page_content` output to prevent context overflow (50K chars max)

### 6.6 README.md
Sections:
1. What it does (1-2 sentences)
2. Quick start (`npx chrome-profile-mcp`)
3. CLI flags (--profile, --port, --debug)
4. Claude Code config example
5. Claude Desktop config example
6. Available tools (table of 20)
7. Requirements (macOS, Chrome, Node 18+)
8. Known limitations

### 6.7 Build verification
```bash
npm run build
# Verify dist/ contains all compiled JS
# Verify dist/cli.js has shebang
# Verify package.json "bin" points correctly
```

## Todo
- [ ] Run full end-to-end test
- [ ] Test all 20 tools manually
- [ ] Test --profile non-interactive mode
- [ ] Test Ctrl+C cleanup
- [ ] Add .mcp.json example to repo
- [ ] Write Claude Desktop config example
- [ ] Error hardening pass
- [ ] Write README.md
- [ ] Verify npm build produces working dist/
- [ ] Test npx flow (optional, requires publish)

## Success Criteria
- All 20 tools work against live Chrome
- Claude Code can connect via .mcp.json and use tools
- Clean shutdown on Ctrl+C or disconnect
- README covers all usage scenarios
- No console.log anywhere in codebase
- Build produces correct dist/ output
