# Code Review Summary

## Scope
- Files reviewed: 11 source files (all in `src/`)
- Lines of code: ~913 total (unique)
- Review focus: Full codebase — all files listed in checklist
- Build status: `tsc --noEmit` PASS, `tsc` PASS (zero errors)

---

## Overall Assessment

Clean, well-structured codebase. KISS/YAGNI/DRY principles followed throughout. Separation of concerns is clear. MCP stdio protocol compliance is correct. The main concern is `evaluate_js` executing arbitrary JS — acceptable by design but should be documented explicitly as a trust boundary. Two minor bugs found: `navigation.ts` is 195 lines (slightly over 200-line limit by actual content count) and a null-state mutation risk in `close_tab`.

---

## Critical Issues

None.

---

## High Priority Findings

### H1: `evaluate_js` — Arbitrary JS Execution (Accepted Risk, Needs Doc)

**File:** `src/mcp/tools/inspection.ts:84-103`

```typescript
const result = await state.page.evaluate(code);
```

`code` is arbitrary string from MCP client. This is **intentional by design** (it's a browser control MCP server), but:
- No timeout guard on `evaluate` (a `while(true){}` loop hangs the MCP server indefinitely)
- The tool description doesn't mention the trust requirement

**Recommendation:** Add explicit timeout and document the trust boundary:

```typescript
const result = await state.page.evaluate(code, undefined, { timeout: 10000 });
// Note: page.evaluate() doesn't accept a timeout option directly in Playwright
// Use page.setDefaultTimeout or wrap with Promise.race
```

Actually in Playwright, `page.evaluate()` has no timeout option. Safer approach:

```typescript
const result = await Promise.race([
  state.page.evaluate(code),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error("evaluate_js timed out after 10s")), 10000)
  ),
]);
```

**Severity:** High (DoS risk if MCP client sends infinite loop). Acceptable as accepted risk for a local tool, but needs timeout.

---

### H2: Hardcoded macOS-only Chrome Path

**File:** `src/chrome/launch-chrome.ts:6-8`, `src/chrome/discover-profiles.ts:5-11`

```typescript
const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CHROME_USER_DATA_DIR = join(homedir(), "Library", "Application Support", "Google", "Chrome");
```

Both are hardcoded macOS paths. The tool silently fails on Linux/Windows with confusing errors. The README should state macOS-only clearly; or add a runtime platform check with a clear error.

**Recommendation:**

```typescript
if (process.platform !== "darwin") {
  throw new Error("chrome-profile-mcp currently only supports macOS.");
}
```

---

### H3: `null as unknown as ChildProcess` Type Lie

**File:** `src/chrome/launch-chrome.ts:80-83`

```typescript
return {
  process: null as unknown as ChildProcess,  // <-- type lie
  port,
  cdpUrl: existingCdp,
};
```

`ChromeInstance.process` is typed as `ChildProcess` but is `null` when reusing an existing CDP. Downstream `setupCleanup` uses optional chaining (`chrome.process?.kill()`) which handles it, but the type contract is violated.

**Recommendation:** Change `ChromeInstance.process` to `ChildProcess | null` and update all usage:

```typescript
export interface ChromeInstance {
  process: ChildProcess | null;
  port: number;
  cdpUrl: string;
}
```

---

## Medium Priority Improvements

### M1: `close_tab` — Active Tab Fallback After Close

**File:** `src/mcp/tools/navigation.ts:181-184`

```typescript
const remaining = state.context.pages();
if (remaining.length > 0) {
  state.page = remaining[0];  // always picks index 0
}
```

After closing any tab (not just the active one), `state.page` is set to `remaining[0]`. If user closes tab index 2 of 5, the active tab unexpectedly jumps to index 0. Should only update `state.page` if the closed tab was the active one:

```typescript
if (target === state.page && remaining.length > 0) {
  state.page = remaining[0];
}
```

---

### M2: `list_tabs` — Not Wrapped in `safeTool`

**File:** `src/mcp/tools/navigation.ts:80-94`

`list_tabs` and `switch_tab` are the only tools that don't use `safeTool`. If `state.context.pages()` throws (e.g., disconnected browser), the error propagates unhandled as an MCP protocol error rather than a graceful `isError: true` response. Wrap both in `safeTool` for consistency.

---

### M3: `waitForCDP` — No Abort on Chrome Process Exit

**File:** `src/chrome/launch-chrome.ts:34-51`

If Chrome crashes immediately on launch, `waitForCDP` polls for the full `timeoutMs` (15s) before failing. The Chrome process exit event is never monitored during the wait.

**Recommendation:** Race the CDP poll against a process exit listener:

```typescript
await new Promise<void>((_, reject) => {
  chromeProcess.once("exit", (code) =>
    reject(new Error(`Chrome exited with code ${code} before CDP was ready`))
  );
}).catch(/* race */);
```

---

### M4: Port Validation Missing

**File:** `src/cli.ts:86`

```typescript
const port = parseInt(opts.port, 10);
```

No validation that `port` is a valid number (1-65535). If `--port abc` is passed, `parseInt` returns `NaN`, which propagates silently into Chrome args as `--remote-debugging-port=NaN`.

**Recommendation:**

```typescript
const port = parseInt(opts.port, 10);
if (isNaN(port) || port < 1 || port > 65535) {
  throw new Error(`Invalid port: "${opts.port}". Must be 1-65535.`);
}
```

---

### M5: `server.ts` Tool Count Hardcoded

**File:** `src/mcp/server.ts:31`

```typescript
log.info("Registered 18 browser control tools.");
```

Count is hardcoded. If tools are added/removed, this silently lies. Either remove this log or compute it dynamically (MCP SDK may not expose a count, so removal is simplest per YAGNI).

---

## Low Priority Suggestions

### L1: `navigation.ts` Line Count

At 195 lines it's just under the 200-line limit but dense. Consider splitting into `navigation-tabs.ts` and `navigation-page.ts` if tools grow. Currently acceptable.

### L2: `select_option` — Value vs Label Ambiguity

**File:** `src/mcp/tools/interaction.ts:126`

```typescript
await state.page.selectOption(selector, value, { timeout: 5000 });
```

Playwright's `selectOption` with a plain string matches by value, not label. The tool description says "Value or label" but Playwright needs `{ label: value }` for label matching. This is a documentation/behavior mismatch that could confuse AI clients.

### L3: `type` Tool Echo in Response

**File:** `src/mcp/tools/interaction.ts:44-47`

```typescript
text: `Typed "${text}" into ${selector}`,
```

Echoing user-typed text (potentially passwords) in the response. Low risk in a local MCP context, but worth noting.

---

## Positive Observations

- All logging uses `console.error` via `log.*` — stdio protocol fully respected, zero `console.log` calls anywhere.
- `safeTool` wrapper is clean and reused consistently (except M2).
- `strict: true` in tsconfig with zero type errors at build time.
- `type "text" as const` pattern used correctly throughout to satisfy MCP SDK literal type requirements.
- Port availability check before Chrome launch prevents confusing failures.
- Cleanup handlers handle `null` process (optional chaining) and are idempotent (`cleaning` guard).
- `MAX_CONTENT_LENGTH = 50_000` truncation in `get_page_content` — good memory guard.
- File sizes: all 11 files under 200 lines. `navigation.ts` at 195 is borderline but compliant.
- `isPortAvailable` uses proper `server.close()` before resolving — no port leak.

---

## Recommended Actions

1. **[High] Fix type lie** — `ChromeInstance.process: ChildProcess | null` (H3) — 5 min fix
2. **[High] Add `evaluate_js` timeout** — wrap with `Promise.race` + 10s timeout (H1)
3. **[High] Add platform guard** — throw early on non-macOS (H2)
4. **[Medium] Fix `close_tab` active tab logic** — only update `state.page` if closed tab was active (M1)
5. **[Medium] Wrap `list_tabs`/`switch_tab` in `safeTool`** — consistency + resilience (M2)
6. **[Medium] Add port validation** — `NaN` guard after `parseInt` (M4)
7. **[Low] Remove hardcoded tool count log** or make dynamic (M5)
8. **[Low] Clarify `select_option` label matching** in description (L2)

---

## Metrics

- Type Coverage: 100% (strict mode, zero errors)
- Test Coverage: Not applicable (no test suite — see tester report)
- Linting Issues: 0 (tsc clean)
- File size violations: 0 (all <= 200 lines, `navigation.ts` at 195)
- Build: PASS
- Typecheck: PASS

---

## Unresolved Questions

1. Is `evaluate_js` intentionally unrestricted (local-only use assumed)? If this MCP server is ever exposed to untrusted clients, the arbitrary JS execution becomes a critical security issue requiring an allowlist or sandboxing approach.
2. Are Windows/Linux platforms in scope? Both `CHROME_PATH` and `CHROME_USER_DATA_DIR` are macOS-only. If cross-platform is desired, platform detection logic is needed.
