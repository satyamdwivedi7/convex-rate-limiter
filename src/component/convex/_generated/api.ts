import { makeFunctionReference } from "convex/server";

export const internal = {
  rateLimits: {
    cleanup: makeFunctionReference<"mutation", "internal">("rateLimits:cleanup"),
  },
};
