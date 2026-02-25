import type { Browser, BrowserContext, Page } from "playwright";

/** Shared mutable state passed to all MCP tool handlers. */
export interface BrowserState {
  page: Page;
  context: BrowserContext;
  browser: Browser;
}
