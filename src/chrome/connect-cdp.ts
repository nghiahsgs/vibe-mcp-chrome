import { chromium, type Browser, type Page, type BrowserContext } from "playwright";
import { log } from "../utils/logger.js";

export interface BrowserConnection {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

/** Connect Playwright to a running Chrome instance via CDP. */
export async function connectCDP(
  cdpUrl: string
): Promise<BrowserConnection> {
  const browser = await chromium.connectOverCDP(cdpUrl);
  const contexts = browser.contexts();

  if (contexts.length === 0) {
    throw new Error(
      "No browser contexts found after CDP connection."
    );
  }

  const context = contexts[0];
  const pages = context.pages();
  const page =
    pages.length > 0 ? pages[0] : await context.newPage();

  log.info(
    `Connected via CDP. ${pages.length} existing tab(s).`
  );

  return { browser, context, page };
}
