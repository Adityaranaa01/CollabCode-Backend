import http from "http";
import app from "./app.js";
import { env } from "./config/env.js";
import { initializeSocket } from "./sockets/index.js";
import { cleanupExpiredTokens } from "./services/auth.service.js";

const server = http.createServer(app);
const io = initializeSocket(server);
app.set("io", io);

const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const cleanupInterval = setInterval(async () => {
  try {
    const count = await cleanupExpiredTokens();
    if (count > 0) {
      console.log(`[Cleanup] Removed ${count} expired refresh token(s)`);
    }
  } catch (error) {
    console.error("[Cleanup] Failed to remove expired tokens:", error);
  }
}, CLEANUP_INTERVAL_MS);

server.listen(env.PORT, () => {
  console.log(`[Server] Running on port ${env.PORT} (${env.NODE_ENV})`);
});

const gracefulShutdown = () => {
  console.log("[Server] Shutting down...");
  clearInterval(cleanupInterval);
  io.close(() => {
    server.close(() => {
      console.log("[Server] Closed.");
      process.exit(0);
    });
  });
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
