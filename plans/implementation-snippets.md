# Chrome Profile MCP Server - Implementation Snippets

## 1. List Chrome Profiles

```typescript
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

export function listChromeProfiles(): string[] {
  const chromeDataDir = join(process.env.HOME!, 'Library/Application Support/Google/Chrome');
  const localStatePath = join(chromeDataDir, 'Local State');

  try {
    const localState = JSON.parse(readFileSync(localStatePath, 'utf-8'));
    const profiles = Object.keys(localState.profile?.info_cache || {});
    return profiles;
  } catch (e) {
    console.error('Failed to read Chrome profiles', e);
    return [];
  }
}
```

Or use `@fnet/chrome-profiles`:
```typescript
import { getChromeProfiles } from '@fnet/chrome-profiles';
const profiles = await getChromeProfiles();
```

---

## 2. Launch Chrome with CDP

```typescript
import { spawn } from 'child_process';
import { join } from 'path';

export function launchChromeWithCDP(profile: string, port: number = 9222): Promise<void> {
  const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const chromeDataDir = join(process.env.HOME!, 'Library/Application Support/Google/Chrome');

  return new Promise((resolve, reject) => {
    const chrome = spawn(chromeBinary, [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${chromeDataDir}`,
      `--profile-directory=${profile}`
    ], {
      detached: false,
      stdio: 'ignore'
    });

    chrome.on('error', reject);
    // Give Chrome time to start
    setTimeout(resolve, 2000);
  });
}
```

---

## 3. Connect Playwright to Running Chrome

```typescript
import { chromium } from 'playwright';
import fetch from 'node-fetch';

export async function connectToChromeViaCDP(port: number = 9222) {
  // Get WebSocket URL from Chrome
  const response = await fetch(`http://localhost:${port}/json/version`);
  const data = await response.json();
  const wsUrl = data.webSocketDebuggerUrl;

  // Connect Playwright
  const browser = await chromium.connectOverCDP(wsUrl);
  return browser;
}
```

---

## 4. Minimal MCP Server with Browser Tools

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { chromium } from "playwright";

const server = new McpServer({
  name: "chrome-mcp",
  version: "1.0.0"
});

let browser: any = null;

// Tool definitions
const navigateSchema = z.object({
  url: z.string().describe("URL to navigate to")
});

const clickSchema = z.object({
  selector: z.string().describe("CSS selector to click")
});

const typeSchema = z.object({
  selector: z.string().describe("CSS selector"),
  text: z.string().describe("Text to type")
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "navigate",
      description: "Navigate to a URL",
      inputSchema: navigateSchema
    },
    {
      name: "click",
      description: "Click an element",
      inputSchema: clickSchema
    },
    {
      name: "type",
      description: "Type text into an element",
      inputSchema: typeSchema
    },
    {
      name: "screenshot",
      description: "Take a screenshot of the current page",
      inputSchema: z.object({})
    }
  ]
}));

// Execute tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (!browser) {
    return {
      content: [{ type: "text", text: "Browser not connected" }],
      isError: true
    };
  }

  const page = browser.contexts()[0]?.pages()[0];
  if (!page) {
    return {
      content: [{ type: "text", text: "No active page" }],
      isError: true
    };
  }

  try {
    switch (request.params.name) {
      case "navigate":
        await page.goto(request.params.arguments.url);
        return { content: [{ type: "text", text: "Navigated" }] };

      case "click":
        await page.click(request.params.arguments.selector);
        return { content: [{ type: "text", text: "Clicked" }] };

      case "type":
        await page.fill(request.params.arguments.selector, request.params.arguments.text);
        return { content: [{ type: "text", text: "Text entered" }] };

      case "screenshot":
        const buffer = await page.screenshot();
        return {
          content: [{
            type: "text",
            text: `Screenshot (${buffer.length} bytes, base64): ${buffer.toString('base64').slice(0, 100)}...`
          }]
        };

      default:
        return {
          content: [{ type: "text", text: "Unknown tool" }],
          isError: true
        };
    }
  } catch (error: any) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true
    };
  }
});

// Initialization
async function start() {
  // Connect to Chrome via CDP (assumes Chrome running on port 9222)
  try {
    const response = await fetch('http://localhost:9222/json/version');
    const data = await response.json();
    browser = await chromium.connectOverCDP(data.webSocketDebuggerUrl);
    console.error('Connected to Chrome via CDP', { stderr: true });
  } catch (e) {
    console.error('Failed to connect to Chrome', e);
  }

  await server.connect(new StdioServerTransport());
}

start().catch(console.error);
```

---

## 5. CLI Entry Point

```typescript
#!/usr/bin/env node

import { program } from 'commander';
import { listChromeProfiles, launchChromeWithCDP, startMCPServer } from './index';

program
  .command('list')
  .description('List available Chrome profiles')
  .action(async () => {
    const profiles = listChromeProfiles();
    profiles.forEach(p => console.log(`  • ${p}`));
  });

program
  .command('launch <profile>')
  .option('-p, --port <port>', 'CDP port', '9222')
  .description('Launch Chrome with specific profile and MCP server')
  .action(async (profile, options) => {
    console.log(`Launching Chrome with profile: ${profile}`);
    await launchChromeWithCDP(profile, parseInt(options.port));

    console.log(`Starting MCP server...`);
    await startMCPServer();
  });

program.parse();
```

---

## 6. Package.json

```json
{
  "name": "chrome-profile-mcp",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "chrome-profile-mcp": "./dist/cli.js"
  },
  "scripts": {
    "dev": "tsx src/cli.ts",
    "build": "tsc",
    "start": "node dist/cli.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.27.0",
    "@fnet/chrome-profiles": "^1.0.0",
    "commander": "^12.0.0",
    "playwright": "^1.48.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.3.0",
    "tsx": "^4.0.0"
  }
}
```

---

## 7. TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ES2020",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Notes

- Replace hardcoded paths with platform detection if cross-platform support needed
- Add error handling for all async operations
- Use `console.error()` for logging in stdio context
- Consider process management library for graceful Chrome shutdown
- Test with different Chrome versions (especially 136+)
