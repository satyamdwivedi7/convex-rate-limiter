import { describe, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { anyApi } from "convex/server";
import schema from "../src/component/convex/schema";
import { parseWindow, validateInputs } from "../src/component/convex/utils";

const modules = import.meta.glob("../src/component/convex/**/*.*s");

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

  test("throws for an unrecognized window string", () => {
    expect(() => parseWindow("2m")).toThrow(Error);
    expect(() => parseWindow("")).toThrow(Error);
    expect(() => parseWindow("30s")).toThrow(Error);
  });
});

describe("validateInputs", () => {
  test("does not throw for valid key and limit", () => {
    expect(() => validateInputs("user:123", 5)).not.toThrow();
    expect(() => validateInputs("login:a@b.com", 1)).not.toThrow();
  });

  test("throws for limit <= 0", () => {
    expect(() => validateInputs("key", 0)).toThrow(Error);
    expect(() => validateInputs("key", -1)).toThrow(Error);
  });

  test("throws for non-integer limit", () => {
    expect(() => validateInputs("key", 1.5)).toThrow(Error);
    expect(() => validateInputs("key", 0.5)).toThrow(Error);
  });

  test("throws for empty key", () => {
    expect(() => validateInputs("", 5)).toThrow(Error);
  });
});

describe("checkRateLimit", () => {
  test("allows first request and returns remaining = limit - 1", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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

  test("denies at exactly limit, returns remaining: 0", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:user3", limit: 3, window: "1m" };

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    const denied = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(denied.allowed).toBe(false);
    expect(denied.remaining).toBe(0);
    expect(typeof denied.resetAt).toBe("number");
  });

  test("resets window after expiry", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "test:user4", limit: 3, window: "1m" };
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);
    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    const result = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);

    vi.restoreAllMocks();
  });

  test("throws for empty key", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "", limit: 5, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for limit <= 0", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 0, window: "1m" })
    ).rejects.toThrow();
  });

  test("throws for invalid window string", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(anyApi.rateLimits.checkRateLimit, { key: "test", limit: 5, window: "2m" })
    ).rejects.toThrow();
  });
});

describe("enforceRateLimit", () => {
  test("returns remaining and resetAt when under limit", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(anyApi.rateLimits.enforceRateLimit, {
      key: "enforce:user1",
      limit: 5,
      window: "1m",
    });
    expect(result.remaining).toBe(4);
    expect(typeof result.resetAt).toBe("number");
  });

  test("throws ConvexError with RATE_LIMITED code when over limit", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "enforce:user2", limit: 2, window: "1m" };

    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);

    let errorData: any = null;
    try {
      await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    } catch (e: any) {
      // convex-test serializes ConvexError.data as a JSON string
      const raw = e.data;
      errorData = typeof raw === "string" ? JSON.parse(raw) : raw;
    }

    expect(errorData).not.toBeNull();
    expect(errorData.code).toBe("RATE_LIMITED");
    expect(errorData.remaining).toBe(0);
    expect(typeof errorData.resetAt).toBe("number");
  });

  test("does not increment count when denying", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "enforce:user3", limit: 2, window: "1m" };

    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);
    await t.mutation(anyApi.rateLimits.enforceRateLimit, args);

    for (let i = 0; i < 2; i++) {
      try { await t.mutation(anyApi.rateLimits.enforceRateLimit, args); } catch {}
    }

    const status = await t.query(anyApi.rateLimits.peek, args);
    expect(status.remaining).toBe(0);
  });
});

describe("peek", () => {
  test("returns remaining = limit and resetAt = null when no window active", async () => {
    const t = convexTest(schema, modules);
    const result = await t.query(anyApi.rateLimits.peek, {
      key: "peek:unseen",
      limit: 10,
      window: "1h",
    });
    expect(result.remaining).toBe(10);
    expect(result.resetAt).toBeNull();
  });

  test("returns correct remaining without incrementing count", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "peek:user1", limit: 5, window: "1m" };

    await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    await t.mutation(anyApi.rateLimits.checkRateLimit, args);

    const peeked = await t.query(anyApi.rateLimits.peek, args);
    expect(peeked.remaining).toBe(3);
    expect(typeof peeked.resetAt).toBe("number");

    // confirm peek didn't increment
    const third = await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    expect(third.remaining).toBe(2);
  });

  test("returns resetAt = null when window has expired", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "peek:user2", limit: 5, window: "1m" };
    const now = Date.now();

    vi.spyOn(Date, "now").mockReturnValue(now);
    await t.mutation(anyApi.rateLimits.checkRateLimit, args);

    vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
    const result = await t.query(anyApi.rateLimits.peek, args);
    expect(result.remaining).toBe(5);
    expect(result.resetAt).toBeNull();

    vi.restoreAllMocks();
  });

  test("returns remaining = 0 when at limit within window", async () => {
    const t = convexTest(schema, modules);
    const args = { key: "peek:user3", limit: 3, window: "1m" };

    for (let i = 0; i < 3; i++) {
      await t.mutation(anyApi.rateLimits.checkRateLimit, args);
    }

    const peeked = await t.query(anyApi.rateLimits.peek, args);
    expect(peeked.remaining).toBe(0);
    expect(typeof peeked.resetAt).toBe("number");
  });
});

describe("cleanup", () => {
  const EIGHT_DAYS_MS = 8 * 24 * 60 * 60 * 1000;

  test("deletes records older than 8 days", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("rate_limits", {
        key: "stale:user1",
        count: 3,
        windowStart: now - EIGHT_DAYS_MS - 1000,
      });
    });

    await t.mutation(anyApi.rateLimits.cleanup, {});

    await t.run(async (ctx) => {
      const record = await ctx.db
        .query("rate_limits")
        .filter((q: any) => q.eq(q.field("key"), "stale:user1"))
        .unique();
      expect(record).toBeNull();
    });
  });

  test("preserves records within 8 days", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("rate_limits", {
        key: "fresh:user1",
        count: 2,
        windowStart: now - EIGHT_DAYS_MS + 60_000,
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
