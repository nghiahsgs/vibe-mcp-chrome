import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserState } from "../types.js";
import { safeTool } from "./safe-tool-wrapper.js";

export function registerNavigationTools(
  server: McpServer,
  state: BrowserState
): void {
  server.tool(
    "navigate",
    "Navigate active tab to a URL",
    { url: z.string().describe("URL to navigate to") },
    async ({ url }) =>
      safeTool(async () => {
        await state.page.goto(url, {
          waitUntil: "domcontentloaded",
          timeout: 30000,
        });
        const title = await state.page.title();
        return {
          content: [
            {
              type: "text" as const,
              text: `Navigated to: ${url}\nTitle: ${title}`,
            },
          ],
        };
      })
  );

  server.tool("go_back", "Go back in browser history", {}, async () =>
    safeTool(async () => {
      await state.page.goBack({ waitUntil: "domcontentloaded" });
      return {
        content: [
          {
            type: "text" as const,
            text: `Went back to: ${state.page.url()}`,
          },
        ],
      };
    })
  );

  server.tool(
    "go_forward",
    "Go forward in browser history",
    {},
    async () =>
      safeTool(async () => {
        await state.page.goForward({
          waitUntil: "domcontentloaded",
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Went forward to: ${state.page.url()}`,
            },
          ],
        };
      })
  );

  server.tool("reload", "Reload current page", {}, async () =>
    safeTool(async () => {
      await state.page.reload({ waitUntil: "domcontentloaded" });
      return {
        content: [
          {
            type: "text" as const,
            text: `Reloaded: ${state.page.url()}`,
          },
        ],
      };
    })
  );

  server.tool(
    "list_tabs",
    "List all open tabs with their URLs",
    {},
    async () =>
      safeTool(async () => {
        const pages = state.context.pages();
        const tabs = pages.map(
          (p, i) =>
            `[${i}] ${p.url()}${p === state.page ? " (active)" : ""}`
        );
        return {
          content: [{ type: "text" as const, text: tabs.join("\n") }],
        };
      })
  );

  server.tool(
    "switch_tab",
    "Switch active tab by index",
    { index: z.number().describe("Tab index (0-based)") },
    async ({ index }) =>
      safeTool(async () => {
        const pages = state.context.pages();
        if (index < 0 || index >= pages.length) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Invalid tab index. ${pages.length} tab(s) open.`,
              },
            ],
            isError: true as const,
          };
        }
        state.page = pages[index];
        await state.page.bringToFront();
        return {
          content: [
            {
              type: "text" as const,
              text: `Switched to tab ${index}: ${state.page.url()}`,
            },
          ],
        };
      })
  );

  server.tool(
    "new_tab",
    "Open a new tab, optionally navigating to a URL",
    {
      url: z
        .string()
        .optional()
        .describe("URL to open (optional)"),
    },
    async ({ url }) =>
      safeTool(async () => {
        const newPage = await state.context.newPage();
        if (url) {
          await newPage.goto(url, {
            waitUntil: "domcontentloaded",
          });
        }
        state.page = newPage;
        return {
          content: [
            {
              type: "text" as const,
              text: `New tab opened${url ? `: ${url}` : ""}`,
            },
          ],
        };
      })
  );

  server.tool(
    "close_tab",
    "Close a tab by index (defaults to active tab)",
    {
      index: z
        .number()
        .optional()
        .describe("Tab index to close (default: active)"),
    },
    async ({ index }) =>
      safeTool(async () => {
        const pages = state.context.pages();
        const target =
          index !== undefined ? pages[index] : state.page;
        if (!target) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Invalid tab index",
              },
            ],
            isError: true as const,
          };
        }
        const wasActive = target === state.page;
        await target.close();
        const remaining = state.context.pages();
        if (wasActive && remaining.length > 0) {
          state.page = remaining[0];
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Closed tab. ${remaining.length} remaining.`,
            },
          ],
        };
      })
  );
}
