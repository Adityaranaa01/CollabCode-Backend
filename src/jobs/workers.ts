import { Worker, Job } from "bullmq";
import { env } from "../config/env.js";
import { cleanupExpiredTokens } from "../services/auth.service.js";
import { cleanExpiredMessages } from "../services/message.service.js";
import { logger } from "../utils/logger.js";

const connectionConfig = { url: env.REDIS_URL, maxRetriesPerRequest: null };

let maintenanceWorker: Worker | null = null;

/**
 * Starts the BullMQ maintenance worker.
 *
 * The worker processes jobs from the "maintenance" queue. Each job
 * name maps to a specific maintenance function. This replaces the
 * previous setInterval-based approach with several advantages:
 *
 * 1. Survives restarts — jobs are persisted in Redis, not in-process timers
 * 2. Deduplicates — with multiple server instances, only one processes each job
 * 3. Retries — failed jobs are retried with exponential backoff (3 attempts)
 * 4. Observable — completed/failed jobs are stored in Redis for debugging
 */
export function startWorkers(): void {
  maintenanceWorker = new Worker(
    "maintenance",
    async (job: Job) => {
      const childLogger = logger.child({ jobName: job.name, jobId: job.id });

      switch (job.name) {
        case "cleanup-expired-tokens": {
          const count = await cleanupExpiredTokens();
          childLogger.info({ deletedCount: count }, "Token cleanup completed");
          return { deletedCount: count };
        }

        case "cleanup-expired-messages": {
          const count = await cleanExpiredMessages();
          childLogger.info({ deletedCount: count }, "Message retention cleanup completed");
          return { deletedCount: count };
        }

        default: {
          childLogger.warn("Unknown job name, skipping");
          return { skipped: true };
        }
      }
    },
    {
      connection: connectionConfig as any,
      concurrency: 1,  // Maintenance jobs run sequentially — no need for parallelism
    }
  );

  maintenanceWorker.on("failed", (job, err) => {
    logger.error(
      { jobName: job?.name, jobId: job?.id, err },
      "Maintenance job failed"
    );
  });

  logger.info("BullMQ maintenance worker started");
}

export async function stopWorkers(): Promise<void> {
  if (maintenanceWorker) {
    await maintenanceWorker.close();
    maintenanceWorker = null;
    logger.info("BullMQ maintenance worker stopped");
  }
}
