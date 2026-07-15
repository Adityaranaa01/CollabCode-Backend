import { Router } from "express";
import authRoutes from "./auth.routes.js";
import roomRoutes from "./room.routes.js";
import executionRoutes from "./execution.routes.js";
import { getHealthStatus } from "../services/health.service.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/rooms", roomRoutes);
router.use("/execute", executionRoutes);

// Liveness probe — is the process alive?
router.get("/health/live", (_req, res) => {
  res.status(200).json({ status: "alive" });
});

// Readiness probe — is the service ready to accept traffic?
router.get("/health/ready", async (_req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

// Backward-compatible alias
router.get("/health", async (_req, res) => {
  const health = await getHealthStatus();
  const statusCode = health.status === "healthy" ? 200 : 503;
  res.status(statusCode).json(health);
});

export default router;

