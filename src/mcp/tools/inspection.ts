import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserState } from "../types.js";
import { safeTool } from "./safe-tool-wrapper.js";

const MAX_CONTENT_LENGTH = 50_000;

export function registerInspectionTools(
  server: McpServer,
  state: BrowserState
): void {
  server.tool(
    "screenshot",
    "Take a screenshot of the current page or a specific element",
    {
      fullPage: z
        .boolean()
        .optional()
        .describe("Capture full page (default: viewport only)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector for element screenshot"),
    },
    async ({ fullPage, selector }) =>
      safeTool(async () => {
        let buffer: Buffer;
        if (selector) {
          buffer = await state.page
            .locator(selector)
            .screenshot({ type: "png" });
        } else {
          buffer = await state.page.screenshot({
            type: "png",
            fullPage: fullPage ?? false,
          });
        }
        const base64 = buffer.toString("base64");
        return {
          content: [
            {
              type: "image" as const,
              mimeType: "image/png",
              data: base64,
            },
          ],
        };
      })
  );

  server.tool(
    "get_page_content",
    "Get page HTML or text content of a specific element",
    {
      selector: z
        .string()
        .optional()
        .describe(
          "CSS selector for specific element (omit for full page)"
        ),
    },
    async ({ selector }) =>
      safeTool(async () => {
        let content: string;
        if (selector) {
          content =
            (await state.page
              .locator(selector)
              .textContent({ timeout: 5000 })) ?? "";
        } else {
          content = await state.page.content();
        }
        if (content.length > MAX_CONTENT_LENGTH) {
          content =
            content.slice(0, MAX_CONTENT_LENGTH) +
            `\n...[truncated at ${MAX_CONTENT_LENGTH} chars]`;
        }
        return {
          content: [{ type: "text" as const, text: content }],
        };
      })
  );

  server.tool(
    "evaluate_js",
    "Execute JavaScript code in the page context and return the result",
    {
      code: z.string().describe("JavaScript code to execute"),
    },
    async ({ code }) =>
      safeTool(async () => {
        const result = await Promise.race([
          state.page.evaluate(code),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("evaluate_js timed out after 10s")),
              10000
            )
          ),
        ]);
        const serialized =
          typeof result === "string"
            ? result
            : JSON.stringify(result, null, 2);
        return {
          content: [
            { type: "text" as const, text: serialized ?? "undefined" },
          ],
        };
      })
  );

  server.tool(
    "wait_for",
    "Wait for an element to appear on the page",
    {
      selector: z.string().describe("CSS selector to wait for"),
      timeout: z
        .number()
        .optional()
        .describe("Timeout in ms (default: 10000)"),
    },
    async ({ selector, timeout }) =>
      safeTool(async () => {
        await state.page.waitForSelector(selector, {
          timeout: timeout ?? 10000,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Element found: ${selector}`,
            },
          ],
        };
      })
  );
}
