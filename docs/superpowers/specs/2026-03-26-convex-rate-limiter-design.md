# Convex Rate Limiter Component — Design Spec

**Date:** 2026-03-26
**Category:** API Usage
**Challenge:** Convex Components Challenge
**npm package name:** `convex-rate-limiter`

---

## Overview

A self-contained Convex component that provides rate limiting for mutations, actions, and HTTP endpoints. Supports fixed-window rate limiting with a read-only peek query. Designed for login brute-force protection, AI API quota enforcement, and public API abuse prevention.

---

## Project Structure

```
convex-rate-limiter/
├── convex.config.ts           # component registration via defineComponent()
├── src/
│   ├── component/
│   │   └── convex/
│   │       ├── schema.ts          # rate_limits table definition
│   │       ├── rateLimits.ts      # checkRateLimit, enforceRateLimit, peek, cleanup
│   │       ├── utils.ts           # parseWindow helper
│   │       └── rateLimits.test.ts
│   └── index.ts                   # host-facing re-exports + types
├── package.json
└── README.md
```

**`convex.config.ts` clarification:** The component ships its own `convex.config.ts` using `defineComponent()`. The host app has a separate `convex/convex.config.ts` using `defineApp().use(rateLimiter)`. These are two distinct files — one inside the npm package, one inside the host app.

---

## Architecture

The component uses Convex's `defineComponent()` API to register itself. It owns a single table (`rate_limits`) and exposes three functions the host app can call. The host wires in the component once:

```ts
// convex/convex.config.ts (host app — separate from the component's own convex.config.ts)
import rateLimiter from "convex-rate-limiter";
export default defineApp().use(rateLimiter);
```

Convex mutations are serialized per document, so concurrent calls on the same key are automatically safe — no additional locking required.

---

## Data Model

```ts
// schema.ts
defineSchema({
  rate_limits: defineTable({
    key: v.string(),         // opaque string provided by caller
    count: v.number(),       // request count in the current window
    windowStart: v.number()  // epoch ms when the current window opened
  }).index("by_key", ["key"])
})
```

**Fixed-window check logic:**
1. Look up record by `key`
2. If no record exists, or `now - windowStart >= windowMs` → reset record (`count = 1`, `windowStart = now`) → **allowed**, `remaining = limit - 1`
3. If `count < limit` → increment `count` → **allowed**, `remaining = limit - count_after_increment`
4. If `count >= limit` → no write → **denied**, `remaining = 0`, `resetAt = windowStart + windowMs`

`remaining` always equals `limit - count_after_increment` for allowed requests, and `0` for denied requests. Since `checkRateLimit` always writes (either reset or increment), it always has a concrete `windowStart`, so `resetAt` is always a `number` (never `null`).

**`peek` query:** Reads the same record without writing. If the window has expired or no record exists, returns clean-slate values (`remaining = limit`, `resetAt = null`) without touching the DB. `resetAt` can be `null` here because no write occurs — there may be no active window.

---

## Input Validation

- `limit` must be a positive integer (`> 0`). `limit <= 0` throws a plain `Error` (developer mistake).
- `key` must be a non-empty string. An empty string throws a plain `Error`.
- `window` must be one of the accepted string literals. Invalid values throw a plain `Error` via `parseWindow`.

These are developer-time errors, not runtime conditions, and are not caught internally. The error messages from `parseWindow` and input validation are not part of the public contract — callers must not pattern-match on them.

---

## Public API

### `checkRateLimit` (mutation)

Always returns; caller decides what to do with `allowed: false`.

```ts
checkRateLimit(ctx, {
  key: string,
  limit: number,
  window: "1m" | "5m" | "15m" | "1h" | "6h" | "24h" | "7d"
}) → Promise<{
  allowed: boolean,
  remaining: number,   // limit - count_after_increment if allowed; 0 if denied
  resetAt: number      // always a number — epoch ms when current window resets
}>
```

### `enforceRateLimit` (mutation)

Throws a `ConvexError` if the limit is exceeded. Drop-in for cases where the caller just wants to abort.

```ts
enforceRateLimit(ctx, {
  key: string,
  limit: number,
  window: "1m" | "5m" | "15m" | "1h" | "6h" | "24h" | "7d"
}) → Promise<{
  remaining: number,
  resetAt: number
}>

// throws:
new ConvexError({ code: "RATE_LIMITED", remaining: 0, resetAt: number })
```

### `peek` (query)

Read-only status check. No side effects. Safe to call from queries and for UI display. `resetAt` is `null` when no active window exists (i.e., the key has never been used or its window has already expired). This differs from `checkRateLimit` which always writes and therefore always has a computable `resetAt`.

```ts
peek(ctx, {
  key: string,
  limit: number,
  window: "1m" | "5m" | "15m" | "1h" | "6h" | "24h" | "7d"
}) → Promise<{
  remaining: number,
  resetAt: number | null  // null = no active window
}>
```

---

## Usage Examples

```ts
// Login brute-force protection (in an action)
await ctx.runMutation(api.rateLimiter.enforceRateLimit, {
  key: "login:" + args.email,
  limit: 5,
  window: "15m"
});

// AI API quota (in an action)
const result = await ctx.runMutation(api.rateLimiter.checkRateLimit, {
  key: "ai-chat:" + userId,
  limit: 20,
  window: "1h"
});
if (!result.allowed) {
  throw new ConvexError("AI quota exceeded");
}

// Show remaining quota in UI (from a query)
const status = await ctx.runQuery(api.rateLimiter.peek, {
  key: "ai-chat:" + userId,
  limit: 20,
  window: "1h"
});

// Map to HTTP 429
try {
  await ctx.runMutation(api.rateLimiter.enforceRateLimit, { key, limit, window });
} catch (e) {
  if (e.data?.code === "RATE_LIMITED") {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((e.data.resetAt - Date.now()) / 1000)) }
    });
  }
}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Concurrent calls on same key | Safe — Convex serializes mutations per document |
| Window expiry | Handled inline on next access — no background job needed |
| Stale records | Cleaned up by daily cron job (registered inside the component) |
| Invalid window string | `parseWindow` throws a plain `Error` — developer mistake, error message is not a public contract |
| `limit <= 0` or empty `key` | Input validation throws a plain `Error` — developer mistake |
| Limit exceeded (`enforceRateLimit`) | `ConvexError` with `{ code: "RATE_LIMITED", remaining: 0, resetAt: number }` |

### Cleanup Cron

A `cronJobs` entry inside the component deletes `rate_limits` records where `windowStart` is older than **8 days**. This is intentionally greater than the maximum configurable window (`"7d"`) to prevent the cron from deleting a record mid-window. Runs daily. The host app does not need to configure this.

---

## Testing

**Tooling:** `vitest` + `convex-test` (official in-memory harness, no real deployment needed)

**Test cases:**
- `checkRateLimit` allows requests under the limit, returns correct `remaining = limit - count_after_increment`
- `checkRateLimit` denies at exactly `limit`, returns `remaining: 0`
- `checkRateLimit` resets correctly after window expires, `remaining` returns to `limit - 1`
- `enforceRateLimit` resolves when under limit
- `enforceRateLimit` throws `ConvexError` with `{ code: "RATE_LIMITED", remaining: 0, resetAt }` when over limit
- `peek` returns correct remaining without incrementing count
- `peek` returns `resetAt: null` when no window is active
- `peek` returns `resetAt: null` when window has expired (does not write)
- Cleanup cron deletes records with `windowStart` older than 8 days, preserves records within 8 days
- Input validation: `limit <= 0` throws, empty `key` throws, invalid window string throws

Time-sensitive tests use `vi.spyOn(Date, 'now')` to control window expiry without real waiting.

---

## npm Package Requirements

Per the Convex component spec:
- `convex.config.ts` defines the component via `defineComponent()`
- Exported functions are callable by host apps
- Published to npm with correct entry points (`main`, `types`, `exports`)
- README documents install, wire-up, and all three API functions

---

## Future Enhancements (v2)

- **Sliding window algorithm** — opt-in via `algorithm: "sliding"` param; stores timestamp arrays per key
- **Burst allowance** — token bucket semantics for sustained + burst use cases
- **IP-based limiting** — helper utility for HTTP action contexts
