import { Queue } from "bullmq";
import { env } from "../config/env.js";

const connectionConfig = { url: env.REDIS_URL, maxRetriesPerRequest: null };

export const maintenanceQueue = new Queue("maintenance", {
  connection: connectionConfig as any,
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 5000,
    },
  },
});

export async function scheduleRecurringJobs(): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    "cleanup-expired-tokens",
    { every: 60 * 60 * 1000 },
    { name: "cleanup-expired-tokens" }
  );

  await maintenanceQueue.upsertJobScheduler(
    "cleanup-expired-messages",
    { every: 6 * 60 * 60 * 1000 },
    { name: "cleanup-expired-messages" }
  );
}
