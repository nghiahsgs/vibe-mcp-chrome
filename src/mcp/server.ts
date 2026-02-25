import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Browser, BrowserContext, Page } from "playwright";
import { registerNavigationTools } from "./tools/navigation.js";
import { registerInteractionTools } from "./tools/interaction.js";
import { registerInspectionTools } from "./tools/inspection.js";
import { log } from "../utils/logger.js";
import type { BrowserState } from "./types.js";

/** Create MCP server with all browser control tools registered. */
export async function createMcpServer(
  browser: Browser,
  context: BrowserContext,
  initialPage: Page
): Promise<McpServer> {
  const server = new McpServer({
    name: "chrome-profile-mcp",
    version: "0.1.0",
  });

  const state: BrowserState = {
    page: initialPage,
    context,
    browser,
  };

  registerNavigationTools(server, state);
  registerInteractionTools(server, state);
  registerInspectionTools(server, state);

  log.info("Registered 18 browser control tools.");
  return server;
}

/** Start the MCP server on stdio transport. */
export async function startServer(server: McpServer): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("MCP server running on stdio. Ready for AI connections.");
}
