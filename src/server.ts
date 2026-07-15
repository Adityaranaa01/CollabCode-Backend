import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { initializeSocket } from "./sockets/index.js";
import { cleanupExpiredTokens } from "./services/auth.service.js";
import { logger } from "./utils/logger.js";

const server = http.createServer(app);
const io = initializeSocket(server);
app.set("io", io);

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const cleanupInterval = setInterval(async () => {
  try {
    const count = await cleanupExpiredTokens();
    if (count > 0) {
      logger.info({ count }, "Removed expired refresh tokens");
    }
  } catch (error) {
    logger.error(error, "Failed to remove expired tokens");
  }
}, CLEANUP_INTERVAL_MS);

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "Server started");
});

const gracefulShutdown = () => {
  logger.info("Shutting down gracefully...");
  clearInterval(cleanupInterval);
  io.close(() => {
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

