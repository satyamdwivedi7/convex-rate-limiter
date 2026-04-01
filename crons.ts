import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "cleanup stale rate limit records",
  { hourUTC: 3, minuteUTC: 0 },
  internal.rateLimits.cleanup
);

export default crons;
