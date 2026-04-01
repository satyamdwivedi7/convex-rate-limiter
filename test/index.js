import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const schema = defineSchema({
  rate_limits: defineTable({
    key: v.string(),
    count: v.number(),
    windowStart: v.number(),
  }).index("by_key", ["key"]),
});

function getModules() {
  const maybeGlob = import.meta.glob;
  if (typeof maybeGlob !== "function") {
    throw new Error(
      "convex-rate-limiter/test requires a Vite-compatible runtime with import.meta.glob"
    );
  }
  return maybeGlob("../**/*.*s");
}

export function register(t, name = "rateLimiter") {
  t.registerComponent(name, schema, getModules());
}

export default { register, schema };
