import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { initializeSocket } from "./sockets/index.js";
import { scheduleRecurringJobs } from "./jobs/queues.js";
import { startWorkers, stopWorkers } from "./jobs/workers.js";
import { redis } from "./config/redis.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(app);
const io = initializeSocket(server);
app.set("io", io);

async function bootstrap(): Promise<void> {
  await scheduleRecurringJobs();
  startWorkers();
  logger.info("BullMQ jobs scheduled and workers started");
}

bootstrap().catch((err) => {
  logger.error(err, "Failed to initialize background jobs");
});

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Server started");
});

const gracefulShutdown = async () => {
  logger.info("Shutting down gracefully...");

  await stopWorkers();

  io.close(() => {
    server.close(async () => {
      await redis.quit();
      logger.info("Server closed");
      process.exit(0);
    });
  });

  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
