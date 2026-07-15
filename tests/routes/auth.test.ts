import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import app from "../../src/app.js";

// Mock prisma for all database calls
vi.mock("../../src/utils/prisma.js", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    subscriptionPlan: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

// Mock Redis
vi.mock("../../src/config/redis.js", () => ({
  redis: {
    ping: vi.fn().mockResolvedValue("PONG"),
    on: vi.fn(),
  },
  createRedisClient: vi.fn().mockReturnValue({
    on: vi.fn(),
    subscribe: vi.fn(),
  }),
}));

vi.mock("../../src/sockets/room-store.js", () => ({
  activeRooms: new Map(),
}));

const { prisma } = await import("../../src/utils/prisma.js");

const mockPlan = {
  id: "plan-free",
  name: "FREE",
  maxRooms: 3,
  maxMembersPerRoom: 5,
  maxJoinedRooms: 10,
  chatRetentionDays: 7,
  maxActiveSessions: 0,
};

describe("Auth Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Re-setup default mocks after restoreAllMocks
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
  });

  describe("POST /api/v1/auth/register", () => {
    it("returns 400 for missing required fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ email: "test@test.com" }); // missing password, username, displayName

      expect(res.status).toBe(400);
    });

    it("returns 400 for invalid email", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        email: "not-an-email",
        password: "ValidPass123!",
        username: "testuser",
        displayName: "Test User",
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 for short password", async () => {
      const res = await request(app).post("/api/v1/auth/register").send({
        email: "test@example.com",
        password: "short",
        username: "testuser",
        displayName: "Test User",
      });

      expect(res.status).toBe(400);
    });

    it("returns 409 when email already exists", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "existing-user",
        email: "taken@example.com",
      } as any);

      const res = await request(app).post("/api/v1/auth/register").send({
        email: "taken@example.com",
        password: "ValidPass123!",
        username: "newuser",
        displayName: "New User",
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain("Email already registered");
    });

    it("returns 201 with tokens on successful registration", async () => {
      // No existing user
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
      // Free plan exists
      vi.mocked(prisma.subscriptionPlan.findUnique).mockResolvedValue(mockPlan as any);
      // User creation
      vi.mocked(prisma.user.create).mockResolvedValue({
        id: "new-user-id",
        email: "new@example.com",
        username: "newuser",
        displayName: "New User",
        plan: mockPlan,
      } as any);
      // Token operations
      vi.mocked(prisma.refreshToken.count).mockResolvedValue(0);
      vi.mocked(prisma.refreshToken.create).mockResolvedValue({
        id: "token-record-id",
        userId: "new-user-id",
        tokenHash: "",
        expiresAt: new Date(Date.now() + 86400000),
      } as any);
      vi.mocked(prisma.refreshToken.update).mockResolvedValue({} as any);

      const res = await request(app).post("/api/v1/auth/register").send({
        email: "new@example.com",
        password: "ValidPass123!",
        username: "newuser",
        displayName: "New User",
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.accessToken.split(".")).toHaveLength(3); // JWT format
      // Refresh token should be in httpOnly cookie, not in body
      expect(res.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("returns 400 for missing fields", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ identifier: "test@test.com" }); // missing password

      expect(res.status).toBe(400);
    });

    it("returns 401 for non-existent user", async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const res = await request(app).post("/api/v1/auth/login").send({
        identifier: "nobody@example.com",
        password: "SomePass123!",
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain("Invalid credentials");
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("returns 200 even without auth (clears cookie gracefully)", async () => {
      const res = await request(app).post("/api/v1/auth/logout");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe("GET /api/v1/auth/me", () => {
    it("returns 401 without auth token", async () => {
      const res = await request(app).get("/api/v1/auth/me");

      expect(res.status).toBe(401);
    });
  });
});
