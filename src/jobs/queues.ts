import { Queue } from "bullmq";
import { env } from "../config/env.js";

/**
 * BullMQ Queues.
 *
 * BullMQ bundles its own ioredis internally, so we pass the connection
 * URL string rather than our ioredis client instance. This avoids type
 * conflicts between the two ioredis versions and lets BullMQ manage
 * its own connection lifecycle.
 *
 * Why BullMQ over Agenda, Bee-Queue, or raw setInterval:
 * - setInterval runs in-process: if the process crashes, the interval is lost,
 *   and if you scale to multiple processes, the job runs N times.
 * - Agenda uses MongoDB as a backend — we already have Redis.
 * - Bee-Queue is unmaintained since 2021.
 * - BullMQ is the maintained successor to Bull, uses Redis Streams (not polling),
 *   supports retries, backoff, rate limiting, priorities, and cron repeats.
 *   It's the standard choice for Redis-backed job queues in Node.js.
 */

const connectionConfig = { url: env.REDIS_URL, maxRetriesPerRequest: null };

/** Handles recurring maintenance jobs (token cleanup, message retention) */
export const maintenanceQueue = new Queue("maintenance", {
  connection: connectionConfig as any,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },  // Keep last 100 completed jobs for debugging
    removeOnFail: { count: 500 },      // Keep last 500 failed jobs for investigation
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,  // 5s, 10s, 20s
    },
  },
});

/**
 * Schedule repeating maintenance jobs.
 * Uses BullMQ's built-in cron repeat — Redis-backed, survives restarts,
 * and deduplicates across multiple server instances (only one runs the job).
 */
export async function scheduleRecurringJobs(): Promise<void> {
  // Token cleanup: every hour
  await maintenanceQueue.upsertJobScheduler(
    "cleanup-expired-tokens",
    { every: 60 * 60 * 1000 },
    { name: "cleanup-expired-tokens" }
  );

  // Message retention: every 6 hours
  await maintenanceQueue.upsertJobScheduler(
    "cleanup-expired-messages",
    { every: 6 * 60 * 60 * 1000 },
    { name: "cleanup-expired-messages" }
  );
}
