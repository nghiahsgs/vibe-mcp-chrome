import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BrowserState } from "../types.js";
import { safeTool } from "./safe-tool-wrapper.js";

export function registerInteractionTools(
  server: McpServer,
  state: BrowserState
): void {
  server.tool(
    "click",
    "Click an element by CSS selector",
    {
      selector: z
        .string()
        .describe("CSS selector of element to click"),
    },
    async ({ selector }) =>
      safeTool(async () => {
        await state.page.click(selector, { timeout: 5000 });
        return {
          content: [
            { type: "text" as const, text: `Clicked: ${selector}` },
          ],
        };
      })
  );

  server.tool(
    "type",
    "Type text into an input element",
    {
      selector: z
        .string()
        .describe("CSS selector of input element"),
      text: z.string().describe("Text to type"),
    },
    async ({ selector, text }) =>
      safeTool(async () => {
        await state.page.fill(selector, text, { timeout: 5000 });
        return {
          content: [
            {
              type: "text" as const,
              text: `Typed "${text}" into ${selector}`,
            },
          ],
        };
      })
  );

  server.tool(
    "scroll",
    "Scroll the page or a specific element into view",
    {
      direction: z
        .enum(["up", "down"])
        .optional()
        .describe("Scroll direction (default: down)"),
      amount: z
        .number()
        .optional()
        .describe("Scroll amount in pixels (default: 500)"),
      selector: z
        .string()
        .optional()
        .describe("CSS selector to scroll into view"),
    },
    async ({ direction, amount, selector }) =>
      safeTool(async () => {
        if (selector) {
          await state.page
            .locator(selector)
            .scrollIntoViewIfNeeded();
          return {
            content: [
              {
                type: "text" as const,
                text: `Scrolled ${selector} into view`,
              },
            ],
          };
        }
        const px = amount ?? 500;
        const dy = direction === "up" ? -px : px;
        await state.page.evaluate((scrollY: number) => {
          window.scrollBy(0, scrollY);
        }, dy);
        return {
          content: [
            {
              type: "text" as const,
              text: `Scrolled ${direction ?? "down"} by ${px}px`,
            },
          ],
        };
      })
  );

  server.tool(
    "hover",
    "Hover over an element",
    { selector: z.string().describe("CSS selector to hover") },
    async ({ selector }) =>
      safeTool(async () => {
        await state.page.hover(selector, { timeout: 5000 });
        return {
          content: [
            { type: "text" as const, text: `Hovered: ${selector}` },
          ],
        };
      })
  );

  server.tool(
    "select_option",
    "Select an option from a dropdown",
    {
      selector: z
        .string()
        .describe("CSS selector of <select> element"),
      value: z.string().describe("Value or label to select"),
    },
    async ({ selector, value }) =>
      safeTool(async () => {
        await state.page.selectOption(selector, value, {
          timeout: 5000,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Selected "${value}" in ${selector}`,
            },
          ],
        };
      })
  );

  server.tool(
    "press_key",
    "Press a keyboard key (e.g. Enter, Tab, Escape, ArrowDown)",
    {
      key: z
        .string()
        .describe("Key to press (e.g. Enter, Tab, Escape)"),
    },
    async ({ key }) =>
      safeTool(async () => {
        await state.page.keyboard.press(key);
        return {
          content: [
            { type: "text" as const, text: `Pressed key: ${key}` },
          ],
        };
      })
  );
}
