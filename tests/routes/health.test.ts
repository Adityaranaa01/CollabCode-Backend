import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

// Mock prisma for health check
vi.mock("../../src/utils/prisma.js", () => ({
  prisma: {
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

// Mock room-store for activeRooms
vi.mock("../../src/sockets/room-store.js", () => ({
  activeRooms: new Map(),
}));

describe("Health Check Endpoints", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/v1/health/live", () => {
    it("returns 200 with alive status", async () => {
      const res = await request(app).get("/api/v1/health/live");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("alive");
    });
  });

  describe("GET /api/v1/health/ready", () => {
    it("returns 200 with health details when DB is up", async () => {
      const res = await request(app).get("/api/v1/health/ready");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.checks.database.status).toBe("ok");
      expect(res.body.checks.database.latencyMs).toBeDefined();
      expect(res.body.metrics.activeRooms).toBe(0);
      expect(res.body.metrics.memoryUsageMB).toBeGreaterThan(0);
      expect(res.body.metrics.nodeVersion).toMatch(/^v\d+/);
      expect(res.body.uptime).toBeGreaterThanOrEqual(0);
      expect(res.body.timestamp).toBeDefined();
    });

    it("returns 503 when database is down", async () => {
      const { prisma } = await import("../../src/utils/prisma.js");
      vi.mocked(prisma.$queryRaw).mockRejectedValueOnce(
        new Error("Connection refused")
      );

      const res = await request(app).get("/api/v1/health/ready");

      expect(res.status).toBe(503);
      expect(res.body.status).toBe("unhealthy");
      expect(res.body.checks.database.status).toBe("error");
      expect(res.body.checks.database.error).toContain("Connection refused");
    });
  });

  describe("GET /api/v1/health (backward compat)", () => {
    it("returns same response as /health/ready", async () => {
      const res = await request(app).get("/api/v1/health");

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("healthy");
      expect(res.body.checks).toBeDefined();
      expect(res.body.metrics).toBeDefined();
    });
  });
});
