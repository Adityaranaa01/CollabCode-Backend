import { Worker, Job } from "bullmq";
import { env } from "../config/env.js";
import { cleanupExpiredTokens } from "../services/auth.service.js";
import { cleanExpiredMessages } from "../services/message.service.js";
import { logger } from "../utils/logger.js";

const connectionConfig = { url: env.REDIS_URL, maxRetriesPerRequest: null };

let maintenanceWorker: Worker | null = null;



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
      concurrency: 1,
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
