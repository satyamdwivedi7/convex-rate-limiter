import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  tenant_plans: defineTable({
    tenantId: v.string(),
    planId: v.string(),
    creditLimit: v.number(),
    periodStart: v.number(),
    periodEnd: v.number(),
    creditsUsed: v.number(),
  }).index("by_tenantId", ["tenantId"]),
});
