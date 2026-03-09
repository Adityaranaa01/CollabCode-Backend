import { Router } from "express";
import authRoutes from "./auth.routes.js";
import roomRoutes from "./room.routes.js";
import executionRoutes from "./execution.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/rooms", roomRoutes);
router.use("/execute", executionRoutes);

// Health check
router.get("/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "CollabCode API is running",
    timestamp: new Date().toISOString(),
  });
});

export default router;
