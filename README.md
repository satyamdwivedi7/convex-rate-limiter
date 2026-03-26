# convex-rate-limiter

Fixed-window rate limiting for [Convex](https://convex.dev) apps.

Protect login endpoints from brute force, enforce AI API quotas, and prevent public API abuse — all within your Convex backend.

## Install

```bash
npm install convex-rate-limiter
```

## Wire Up

In your app's `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import rateLimiter from "convex-rate-limiter";

const app = defineApp();
app.use(rateLimiter);
export default app;
```

## Usage

Component functions are accessed via the `components` namespace that Convex generates when you run `npx convex dev` in your host app. `checkRateLimit` and `enforceRateLimit` are mutations (call from actions); `peek` is a query.

```ts
import { action, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
```

### `enforceRateLimit` — throw on limit exceeded

The simplest integration. Throws `ConvexError` if the rate limit is exceeded.

```ts
export const login = action({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.rateLimiter.rateLimits.enforceRateLimit, {
      key: "login:" + args.email,
      limit: 5,
      window: "15m",
    });
    // proceed with login...
  },
});
```

Map to HTTP 429:

```ts
export const rateLimitedAction = action({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(components.rateLimiter.rateLimits.enforceRateLimit, {
        key: args.key, limit: 10, window: "1m",
      });
    } catch (e: any) {
      if (e.data?.code === "RATE_LIMITED") {
        return new Response("Too Many Requests", {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((e.data.resetAt - Date.now()) / 1000)) },
        });
      }
      throw e;
    }
    // proceed with protected logic...
  },
});
```

### `checkRateLimit` — check and handle manually

```ts
export const sendMessage = action({
  args: { userId: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    const result = await ctx.runMutation(components.rateLimiter.rateLimits.checkRateLimit, {
      key: "ai-chat:" + args.userId,
      limit: 20,
      window: "1h",
    });

    if (!result.allowed) {
      throw new Error(`Rate limited. Resets in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`);
    }
    // result.remaining — slots left in this window
  },
});
```

### `peek` — read-only status (no side effects)

Safe to call from queries and actions. Use for displaying quota in UI.

```ts
export const getQuota = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.rateLimiter.rateLimits.peek, {
      key: "ai-chat:" + args.userId,
      limit: 20,
      window: "1h",
    });
    // { remaining: 14, resetAt: 1712345678000 }
    // { remaining: 20, resetAt: null }  ← no active window yet
  },
});
```

## API Reference

### Window values

`"1m"` | `"5m"` | `"15m"` | `"1h"` | `"6h"` | `"24h"` | `"7d"`

### `checkRateLimit(ctx, { key, limit, window })`

| Field | Type | Description |
|---|---|---|
| `allowed` | `boolean` | Whether the request is permitted |
| `remaining` | `number` | Slots left (`limit - count` if allowed; `0` if denied) |
| `resetAt` | `number` | Epoch ms when current window resets |

### `enforceRateLimit(ctx, { key, limit, window })`

Returns `{ remaining, resetAt }` if allowed.
Throws `ConvexError({ code: "RATE_LIMITED", remaining: 0, resetAt })` if denied.

### `peek(ctx, { key, limit, window })`

| Field | Type | Description |
|---|---|---|
| `remaining` | `number` | Slots left in current window |
| `resetAt` | `number \| null` | `null` if no active window |

## How It Works

Uses a **fixed-window algorithm**: each key tracks a request count and the timestamp when the current window opened. Expired windows reset on the next access. Convex's per-document mutation serialization guarantees correctness under concurrent requests — no locks needed.

A daily background job removes stale records (windows older than 8 days).

## License

MIT
