/** Stderr-safe logger for MCP stdio transport. Never use console.log(). */
export const log = {
  info: (...args: unknown[]) => console.error("[INFO]", ...args),
  warn: (...args: unknown[]) => console.error("[WARN]", ...args),
  error: (...args: unknown[]) => console.error("[ERROR]", ...args),
  debug: (...args: unknown[]) => {
    if (process.env.DEBUG) console.error("[DEBUG]", ...args);
  },
};
