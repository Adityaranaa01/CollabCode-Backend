import { prisma } from "../utils/prisma.js";
import { redis } from "../config/redis.js";
import { activeRooms } from "../sockets/room-store.js";

interface HealthCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  checks: {
    database: { status: "ok" | "error"; latencyMs?: number; error?: string };
    redis: { status: "ok" | "error"; latencyMs?: number; error?: string };
  };
  metrics: {
    activeRooms: number;
    memoryUsageMB: number;
    nodeVersion: string;
  };
}

export async function getHealthStatus(): Promise<HealthCheckResult> {
  const [dbCheck, redisCheck] = await Promise.all([
    checkDatabase(),
    checkRedis(),
  ]);

  const checks = { database: dbCheck, redis: redisCheck };
  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const memory = process.memoryUsage();

  return {
    status: allOk ? "healthy" : "unhealthy",
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
    metrics: {
      activeRooms: activeRooms.size,
      memoryUsageMB: Math.round(memory.rss / 1024 / 1024),
      nodeVersion: process.version,
    },
  };
}

async function checkDatabase(): Promise<{
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

async function checkRedis(): Promise<{
  status: "ok" | "error";
  latencyMs?: number;
  error?: string;
}> {
  const start = Date.now();
  try {
    const result = await redis.ping();
    if (result !== "PONG") throw new Error(`Unexpected PING response: ${result}`);
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
