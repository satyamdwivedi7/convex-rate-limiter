# Convex Rate Limiter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish `convex-rate-limiter`, a Convex component providing `checkRateLimit`, `enforceRateLimit`, and `peek` for fixed-window rate limiting.

**Architecture:** A Convex component with its own `rate_limits` table, three exported functions (two mutations, one query), and a daily cleanup cron. No external dependencies beyond `convex`. Host apps install via npm and wire in with one line.

**Tech Stack:** TypeScript, Convex component API (`defineComponent`), `convex-test` + `vitest` + `@edge-runtime/vm` for testing.

---

## File Map

| File | Responsibility |
|---|---|
| `package.json` | npm package metadata, scripts, peer/dev deps |
| `tsconfig.json` | TypeScript config — only compiles `src/index.ts` + `convex.config.ts` to `dist/` |
| `vitest.config.ts` | Vitest config with `edge-runtime` environment |
| `.gitignore` | Ignore `node_modules`, `dist`, `_generated` |
| `convex.config.ts` | `defineComponent("rateLimiter")` — component registration |
| `src/component/convex/schema.ts` | `rate_limits` table definition |
| `src/component/convex/utils.ts` | `parseWindow`, `validateInputs` — pure helpers |
| `src/component/convex/rateLimits.ts` | `checkRateLimit`, `enforceRateLimit`, `peek`, `cleanup` |
| `src/component/convex/crons.ts` | Daily cleanup cron job registration |
| `src/component/convex/rateLimits.test.ts` | All tests (imports declared once at top) |
| `src/index.ts` | Re-exports component default + public types |
| `README.md` | Install, wire-up, API reference |

**Build output note:** `tsconfig.json` includes only `src/index.ts` and `convex.config.ts`. With no explicit `rootDir`, TypeScript infers `.` as the common root, so output is:
- `src/index.ts` → `dist/src/index.js`
- `convex.config.ts` → `dist/convex.config.js`

The Convex functions in `src/component/convex/` are not compiled to `dist/` — they're deployed via the Convex CLI, not bundled into the npm package as JS.

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create `.npmignore`**

Prevents test files from being included in the published npm package:

```
src/component/convex/*.test.ts
src/component/convex/_generated/
node_modules/
*.tsbuildinfo
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "convex-rate-limiter",
  "version": "0.1.0",
  "description": "Fixed-window rate limiting component for Convex apps",
  "license": "MIT",
  "type": "module",
  "main": "./dist/src/index.js",
  "types": "./dist/src/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/src/index.js",
      "types": "./dist/src/index.d.ts"
    },
    "./convex.config": {
      "import": "./dist/convex.config.js",
      "types": "./dist/convex.config.d.ts"
    }
  },
  "files": ["dist", "src/component"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "convex": ">=1.17.0"
  },
  "devDependencies": {
    "@edge-runtime/vm": "^3.2.0",
    "convex": "^1.17.0",
    "convex-test": "^0.0.33",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Only `src/index.ts` and `convex.config.ts` are compiled to `dist/`. The Convex functions in `src/component/convex/` are excluded from the TypeScript build (they're deployed via Convex CLI, not bundled as JS).

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/index.ts", "convex.config.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
  },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
src/component/convex/_generated/
*.tsbuildinfo
```

- [ ] **Step 6: Install dependencies**

```bash
cd /Users/satyam/node-projects/convex-rate-limiter
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 7: Initialize git and make first commit**

```bash
cd /Users/satyam/node-projects/convex-rate-limiter
git init
git add package.json tsconfig.json vitest.config.ts .gitignore .npmignore
git commit -m "chore: initialize convex-rate-limiter package"
```

---

## Task 2: `parseWindow` and `validateInputs` Utilities (TDD)

**Files:**
- Create: `src/component/convex/utils.ts`
- Create: `src/component/convex/rateLimits.test.ts` (full file with all imports at top)

**Important:** The test file is created here with **all imports declared at the top**. Subsequent tasks append only `describe` blocks — never additional `import` statements. ESM does not allow `import` after non-import code.

- [ ] **Step 1: Create the full test file skeleton with imports and utils tests**

Create `src/component/convex/rateLimits.test.ts`:

```ts
// All imports declared once at the top of this file.
// Subsequent tasks append only describe() blocks below.
import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
// Note: anyApi bypasses Convex's internal/public access control —
// this lets tests call internalMutation functions (e.g. cleanup) directly.
import schema from "./schema";
import { parseWindow, validateInputs } from "./utils";

// ─── parseWindow ─────────────────────────────────────────────────────────────

describe("parseWindow", () => {
  test("returns correct ms for each valid window string", () => {
    expect(parseWindow("1m")).toBe(60_000);
    expect(parseWindow("5m")).toBe(5 * 60_000);
    expect(parseWindow("15m")).toBe(15 * 60_000);
    expect(parseWindow("1h")).toBe(60 * 60_000);
    expect(parseWindow("6h")).toBe(6 * 60 * 60_000);
    expect(parseWindow("24h")).toBe(24 * 60 * 60_000);
    expect(parseWindow("7d")).toBe(7 * 24 * 60 * 60_000);
  });

  test("throws a plain Error for an unrecognized window string", () => {
    expect(() => parseWindow("2m")).toThrow(Error);
    expect(() => parseWindow("")).toThrow(Error);
    expect(() => parseWindow("30s")).toThrow(Error);
  });
});

// ─── validateInputs ──────────────────────────────────────────────────────────

describe("validateInputs", () => {
  test("does not throw for valid key and limit", () => {
    expect(() => validateInputs("user:123", 5)).not.toThrow();
    expect(() => validateInputs("login:a@b.com", 1)).not.toThrow();
  });

  test("throws for limit <= 0", () => {
    expect(() => validateInputs("key", 0)).toThrow(Error);
    expect(() => validateInputs("key", -1)).toThrow(Error);
  });

  test("throws for empty key", () => {
    expect(() => validateInputs("", 5)).toThrow(Error);
  });
});
```

- [ ] **Step 2: Run tests and confirm they fail**

```bash
cd /Users/satyam/node-projects/convex-rate-limiter
npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: Fails with `Cannot find module './utils'` and `Cannot find module './schema'`.

- [ ] **Step 3: Create `src/component/convex/schema.ts`**

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  rate_limits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});
```

- [ ] **Step 4: Create `src/component/convex/utils.ts`**

```ts
const WINDOW_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "15m": 15 * 60_000,
  "1h": 60 * 60_000,
  "6h": 6 * 60 * 60_000,
  "24h": 24 * 60 * 60_000,
  "7d": 7 * 24 * 60 * 60_000,
};

export function parseWindow(window: string): number {
  const ms = WINDOW_MS[window];
  if (ms === undefined) {
    throw new Error(
      `Invalid window "${window}". Must be one of: ${Object.keys(WINDOW_MS).join(", ")}`
    );
  }
  return ms;
}

export function validateInputs(key: string, limit: number): void {
  if (!key) {
    throw new Error("key must be a non-empty string");
  }
  if (limit <= 0) {
    throw new Error("limit must be a positive integer greater than 0");
  }
}
```

- [ ] **Step 5: Run tests and confirm utils tests pass**

```bash
npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: `parseWindow` and `validateInputs` describe blocks pass. No other tests exist yet.

- [ ] **Step 6: Commit**

```bash
git add src/component/convex/schema.ts src/component/convex/utils.ts src/component/convex/rateLimits.test.ts
git commit -m "feat: add schema, parseWindow, and validateInputs"
```

---

## Task 3: `checkRateLimit` Mutation (TDD)

**Files:**
- Create: `src/component/convex/rateLimits.ts`
- Modify: `src/component/convex/rateLimits.test.ts` (append describe block only — no new imports)

- [ ] **Step 1: Append failing tests for `checkRateLimit` to the test file**

Append to the **bottom** of `src/component/convex/rateLimits.test.ts`:

```ts
// ─── checkRateLimit ───────────────────────────────────────────────────────────

describe("checkRateLimit", () => {
  test("allows first request and returns remaining = limit - 1", async () => {
    const t = convexTest(schema);
    const result = await t.mutation(anyApi.rateLimits.checkRateLimit, {
      key: "test:user1",
      limit: 5,
      window: "1m",
    });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
    expect(typeof result.resetAt).toBe("number");
    expect(result.resetAt).toBeGreaterThan(Date.now());
  });

  test("decrements remaining on each allowed request", async () => {
    const t = convexTest(schema);
    const args = { key: "test:user2", limit: 3, window: "1m" };

    const r1 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  test("denies request at exactly limit, returns remaining: 0", async () => {
    const t = convexTest(schema);
    const args = { key: "test:user3", limit: 3, window: "1m" };

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    const denied = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(typeof denied.resetAt).toBe("number");
  });

  test("resets window after expiry, remaining returns to limit - 1", async () => {
    const t = convexTest(schema);
    const args = { key: "test:user4", limit: 3, window: "1m" };
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    // Advance past the 1-minute window
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);

    const result = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    vi.restoreAllMocks();
  });

  test("throws for empty key", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "", limit: 5, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for limit <= 0", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 0, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for invalid window string", async () => {
    const t = convexTest(schema);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 5, window: "2m" })
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests and confirm new tests fail**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(checkRateLimit|FAIL|Error)" | head -20
```

Expected: `checkRateLimit` describe block fails — `anyApi.rateLimits.checkRateLimit` not found at runtime.

- [ ] **Step 3: Create `src/component/convex/rateLimits.ts`**

```ts
import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { parseWindow, validateInputs } from "./utils";

// ─── Shared core logic ────────────────────────────────────────────────────────

async function _checkWindow(
  ctx: { db: any },
  key: string,
  limit: number,
  window: string
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  validateInputs(key, limit);
  const windowMs = parseWindow(window);
  const now = Date.now();

  const existing = await ctx.db
    .query("rate_limits")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();

  // No record, or window has expired — reset
  if (!existing || now - existing.windowStart >= windowMs) {
    if (existing) {
      await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    } else {
      await ctx.db.insert("rate_limits", { key, count: 1, windowStart: now });
    }
    return {
      allowed: true,
      remaining: limit - 1,
      resetAt: now + windowMs,
    };
  }

  // Within window: check count
  if (existing.count < limit) {
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return {
      allowed: true,
      remaining: limit - (existing.count + 1),
      resetAt: existing.windowStart + windowMs,
    };
  }

  // Limit exceeded — no write
  return {
    allowed: false,
    remaining: 0,
    resetAt: existing.windowStart + windowMs,
  };
}

// ─── checkRateLimit ───────────────────────────────────────────────────────────

export const checkRateLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    return _checkWindow(ctx, args.key, args.limit, args.window);
  },
});

// ─── enforceRateLimit ─────────────────────────────────────────────────────────

export const enforceRateLimit = mutation({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ remaining: number; resetAt: number }> => {
    const result = await _checkWindow(ctx, args.key, args.limit, args.window);
    if (!result.allowed) {
      throw new ConvexError({
        code: "RATE_LIMITED",
        remaining: 0,
        resetAt: result.resetAt,
      });
    }
    return { remaining: result.remaining, resetAt: result.resetAt };
  },
});

// ─── peek ─────────────────────────────────────────────────────────────────────

export const peek = query({
  args: {
    key: v.string(),
    limit: v.number(),
    window: v.string(),
  },
  handler: async (ctx, args): Promise<{ remaining: number; resetAt: number | null }> => {
    validateInputs(args.key, args.limit);
    const windowMs = parseWindow(args.window);
    const now = Date.now();

    const existing = await ctx.db
      .query("rate_limits")
      .withIndex("by_key", (q: any) => q.eq("key", args.key))
      .unique();

    if (!existing || now - existing.windowStart >= windowMs) {
      return { remaining: args.limit, resetAt: null };
    }

    return {
      remaining: Math.max(0, args.limit - existing.count),
      resetAt: existing.windowStart + windowMs,
    };
  },
});

// ─── cleanup (internal) ───────────────────────────────────────────────────────

export const cleanup = internalMutation({
  args: {},
  handler: async (ctx): Promise<void> => {
    const cutoff = Date.now() - 8 * 24 * 60 * 60 * 1000; // 8 days — > max window of 7d
    const stale = await ctx.db
      .query("rate_limits")
      .filter((q: any) => q.lt(q.field("windowStart"), cutoff))
      .collect();
    await Promise.all(stale.map((r: any) => ctx.db.delete(r._id)));
  },
});
```

- [ ] **Step 4: Run tests and confirm `checkRateLimit` tests pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(checkRateLimit|✓|✗|PASS|FAIL)" | head -30
```

Expected: All `checkRateLimit` tests pass. Utils tests also still pass.

- [ ] **Step 5: Commit**

```bash
git add src/component/convex/rateLimits.ts src/component/convex/rateLimits.test.ts
git commit -m "feat: implement checkRateLimit mutation"
```

---

## Task 4: `enforceRateLimit` Tests (TDD)

**Files:**
- Modify: `src/component/convex/rateLimits.test.ts` (append describe block — no new imports)

`enforceRateLimit` is already implemented in `rateLimits.ts` from Task 3. This task writes its tests and confirms they pass. The "idempotent on deny" test uses `peek` — it is placed here because `peek` is also already implemented.

- [ ] **Step 1: Append failing tests for `enforceRateLimit`**

Append to the **bottom** of `src/component/convex/rateLimits.test.ts`:

```ts
// ─── enforceRateLimit ─────────────────────────────────────────────────────────

describe("enforceRateLimit", () => {
  test("resolves and returns remaining and resetAt when under limit", async () => {
    const t = convexTest(schema);
    const result = await t.mutation(anyApi.rateLimits.enforceRateLimit, {
      key: "enforce:user1",
      limit: 5,
      window: "1m",
    });
    expect(result.remaining).toBe(4);
    expect(typeof result.resetAt).toBe("number");
  });

  test("throws ConvexError with RATE_LIMITED code when over limit", async () => {
    const t = convexTest(schema);
    const args = { key: "enforce:user2", limit: 2, window: "1m" };

    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);

    let errorData: any = null;
    try {
      await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    } catch (e: any) {
      errorData = e.data;
    }

    expect(errorData).not.toBeNull();
    expect(errorData.code).toBe("RATE_LIMITED");
    expect(errorData.remaining).toBe(0);
    expect(typeof errorData.resetAt).toBe("number");
  });

  test("does not increment count when denying (check via peek)", async () => {
    const t = convexTest(schema);
    const args = { key: "enforce:user3", limit: 2, window: "1m" };

    // Fill the limit
    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);

    // Two denied calls — should not increment count beyond limit
    for (let i = 0; i < 2; i++) {
      try {
        await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
      } catch {}
    }

    // peek confirms count is still at limit (remaining = 0), not inflated
    const status = await t.query(anyApi.rateLimits.peek, args);
    expect(status.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests and confirm `enforceRateLimit` tests pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(enforceRateLimit|✓|✗)" | head -20
```

Expected: All `enforceRateLimit` tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/component/convex/rateLimits.test.ts
git commit -m "test: add enforceRateLimit tests"
```

---

## Task 5: `peek` Tests (TDD)

**Files:**
- Modify: `src/component/convex/rateLimits.test.ts` (append describe block — no new imports)

`peek` is already implemented in `rateLimits.ts` from Task 3. This task writes its tests and confirms they pass.

- [ ] **Step 1: Append failing tests for `peek`**

Append to the **bottom** of `src/component/convex/rateLimits.test.ts`:

```ts
// ─── peek ─────────────────────────────────────────────────────────────────────

describe("peek", () => {
  test("returns remaining = limit and resetAt = null when no window active", async () => {
    const t = convexTest(schema);
    const result = await t.query(anyApi.rateLimits.peek, {
      key: "peek:unseen",
      limit: 10,
      window: "1h",
    });
    expect(result.remaining).toBe(10);
    expect(result.resetAt).toBeNull();
  });

  test("returns correct remaining without incrementing count", async () => {
    const t = convexTest(schema);
    const args = { key: "peek:user1", limit: 5, window: "1m" };

    // Use 2 requests via checkRateLimit
    await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    await t.mutation(anyApi.rateLimits.checkRateLimit, args);

    const peeked = await t.query(anyApi.rateLimits.peek, args);
    expect(peeked.remaining).toBe(3);
    expect(typeof peeked.resetAt).toBe("number");

    // Confirm peek didn't increment: next checkRateLimit should see remaining = 2
    const third = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(third.remaining).toBe(2);
  });

  test("returns resetAt = null when window has expired (no write)", async () => {
    const t = convexTest(schema);
    const args = { key: "peek:user2", limit: 5, window: "1m" };
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);
    await t.mutation(anyApi.rateLimits.checkRateLimit, args);

    // Advance past window
    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);

    const result = await t.query(anyApi.rateLimits.peek, args);
    expect(result.remaining).toBe(5);
    expect(result.resetAt).toBeNull();

    vi.restoreAllMocks();
  });

  test("returns remaining = 0 when at limit within window", async () => {
    const t = convexTest(schema);
    const args = { key: "peek:user3", limit: 3, window: "1m" };

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    const peeked = await t.query(anyApi.rateLimits.peek, args);
    expect(peeked.remaining).toBe(0);
    expect(typeof peeked.resetAt).toBe("number");
  });
});
```

- [ ] **Step 2: Run tests and confirm `peek` tests pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(peek|✓|✗)" | head -20
```

Expected: All `peek` tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/component/convex/rateLimits.test.ts
git commit -m "test: add peek tests"
```

---

## Task 6: Cleanup Cron (TDD)

**Files:**
- Modify: `src/component/convex/rateLimits.test.ts` (append describe block — no new imports)
- Create: `src/component/convex/crons.ts`

`cleanup` is already implemented as an `internalMutation` in `rateLimits.ts`. This task tests it and registers the cron.

**Note on `t.run`:** `convex-test`'s `t.run(async (ctx) => { ... })` provides direct database access for test setup and inspection, bypassing Convex function boundaries. Use it when you need to insert seed data or read raw DB state without going through a public function.

**Note on testing `internalMutation` with `anyApi`:** `anyApi` from `convex/server` bypasses Convex's internal/public access control. This means `t.mutation(anyApi.rateLimits.cleanup, {})` can call `cleanup` even though it is declared as `internalMutation`. This is only valid in tests — real deployed code cannot call internal functions from outside the component.

- [ ] **Step 1: Append failing tests for `cleanup`**

Append to the **bottom** of `src/component/convex/rateLimits.test.ts`:

```ts
// ─── cleanup ──────────────────────────────────────────────────────────────────

describe("cleanup", () => {
  const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

  test("deletes records with windowStart older than 8 days", async () => {
    const t = convexTest(schema);
    const now = Date.now();

    // t.run provides direct DB access for test setup
    await t.run(async (ctx) => {
      await ctx.db.insert("rate_limits", {
        key: "stale:user1",
        count: 3,
        windowStart: now - EIGHT_DAYS_MS - 1000, // 8 days + 1 second ago
      });
    });

    // anyApi bypasses internal/public access control in tests
    await t.mutation(anyApi.rateLimits.cleanup, {});

    await t.run(async (ctx) => {
      const record = await ctx.db
        .query("rate_limits")
        .filter((q: any) => q.eq(q.field("key"), "stale:user1"))
        .unique();
      expect(record).toBeNull();
    });
  });

  test("preserves records with windowStart within 8 days", async () => {
    const t = convexTest(schema);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("rate_limits", {
        key: "fresh:user1",
        count: 2,
        windowStart: now - EIGHT_DAYS_MS + 60_000, // just under 8 days ago
      });
    });

    await t.mutation(anyApi.rateLimits.cleanup, {});

    await t.run(async (ctx) => {
      const record = await ctx.db
        .query("rate_limits")
        .filter((q: any) => q.eq(q.field("key"), "fresh:user1"))
        .unique();
      expect(record).not.toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests and confirm cleanup tests pass**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "(cleanup|✓|✗)" | head -20
```

Expected: All `cleanup` tests pass.

- [ ] **Step 3: Create `src/component/convex/crons.ts`**

```ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "cleanup stale rate limit records",
  { hourUTC: 3, minuteUTC: 0 },
  internal.rateLimits.cleanup
);

export default crons;
```

- [ ] **Step 4: Run full test suite — confirm all tests pass**

```bash
npm test -- --reporter=verbose
```

Expected: All tests pass. Zero failures across utils, checkRateLimit, enforceRateLimit, peek, cleanup.

- [ ] **Step 5: Commit**

```bash
git add src/component/convex/crons.ts src/component/convex/rateLimits.test.ts
git commit -m "feat: add cleanup cron and complete test suite"
```

---

## Task 7: Component Config and Public API

**Files:**
- Create: `convex.config.ts`
- Create: `src/index.ts`

- [ ] **Step 1: Create `convex.config.ts`**

```ts
import { defineComponent } from "convex/server";

const rateLimiter = defineComponent("rateLimiter");
export default rateLimiter;
```

- [ ] **Step 2: Create `src/index.ts`**

The path `"../convex.config"` resolves correctly: TypeScript infers rootDir as `.`, so `src/index.ts` compiles to `dist/src/index.js`, and `"../convex.config"` at runtime resolves to `dist/convex.config.js`. Both files end up in `dist/` with the correct relative path.

```ts
export { default } from "../convex.config";

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
};

export type RateLimitStatus = {
  remaining: number;
  resetAt: number | null;
};

export type RateLimitWindow =
  | "1m"
  | "5m"
  | "15m"
  | "1h"
  | "6h"
  | "24h"
  | "7d";
```

- [ ] **Step 3: Build the package**

```bash
cd /Users/satyam/node-projects/convex-rate-limiter
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 4: Verify build output matches exports map**

```bash
ls dist/
ls dist/src/
```

Expected:
- `dist/convex.config.js` and `dist/convex.config.d.ts` — matches `exports["./convex.config"]`
- `dist/src/index.js` and `dist/src/index.d.ts` — matches `exports["."]`

- [ ] **Step 5: Commit**

```bash
git add convex.config.ts src/index.ts
git commit -m "feat: add component config and public API exports"
```

---

## Task 8: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````md
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

### `enforceRateLimit` — throw on limit exceeded

The simplest integration. Throws `ConvexError` if the rate limit is exceeded.

```ts
// In a Convex action
await ctx.runMutation(api.rateLimiter.enforceRateLimit, {
  key: "login:" + args.email,
  limit: 5,
  window: "15m",
});
```

Map to HTTP 429:

```ts
try {
  await ctx.runMutation(api.rateLimiter.enforceRateLimit, { key, limit: 10, window: "1m" });
} catch (e: any) {
  if (e.data?.code === "RATE_LIMITED") {
    return new Response("Too Many Requests", {
      status: 429,
      headers: { "Retry-After": String(Math.ceil((e.data.resetAt - Date.now()) / 1000)) },
    });
  }
}
```

### `checkRateLimit` — check and handle manually

```ts
const result = await ctx.runMutation(api.rateLimiter.checkRateLimit, {
  key: "ai-chat:" + userId,
  limit: 20,
  window: "1h",
});

if (!result.allowed) {
  throw new Error(`Rate limited. Resets in ${Math.ceil((result.resetAt - Date.now()) / 1000)}s`);
}
// result.remaining — slots left in this window
```

### `peek` — read-only status (no side effects)

Safe to call from queries. Use for displaying quota in UI.

```ts
const status = await ctx.runQuery(api.rateLimiter.peek, {
  key: "ai-chat:" + userId,
  limit: 20,
  window: "1h",
});
// { remaining: 14, resetAt: 1712345678000 }
// { remaining: 20, resetAt: null }  ← no active window yet
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
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, wire-up, and API reference"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/satyam/node-projects/convex-rate-limiter
npm test -- --reporter=verbose
```

Expected: All tests pass. Zero failures.

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: Clean build, no TypeScript errors.

- [ ] **Step 3: Verify package contents**

```bash
npm pack --dry-run
```

Expected output includes:
- `dist/src/index.js`, `dist/src/index.d.ts`
- `dist/convex.config.js`, `dist/convex.config.d.ts`
- `src/component/convex/schema.ts`, `src/component/convex/rateLimits.ts`, etc.
- `README.md`

Does NOT include: `node_modules/`, `src/component/convex/_generated/`, test files.

- [ ] **Step 4: Final commit**

```bash
git status
git add -A
git commit -m "chore: final build artifacts"
```

---

## Publish Checklist (after all tasks complete)

- [ ] Review version in `package.json`
- [ ] `npm publish --access public`
- [ ] Submit to Convex Components Directory
