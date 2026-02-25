/**
 * Wraps an async function in try/catch, returning MCP-compatible error on failure.
 * Uses `as const` to preserve literal types for the SDK.
 */
export async function safeTool<T>(fn: () => Promise<T>): Promise<
  | T
  | {
      content: [{ type: "text"; text: string }];
      isError: true;
    }
> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text" as const, text: `Error: ${msg}` }],
      isError: true as const,
    };
  }
}
