import { makeFunctionReference } from "convex/server";

export const internal = {
  rateLimits: {
    cleanup: makeFunctionReference<"mutation", Record<string, never>>("rateLimits:cleanup"),
  },
};
