import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import { errorHandler } from "../../src/middleware/errorHandler.js";
import { ApiError } from "../../src/utils/ApiError.js";

function createMockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

describe("errorHandler middleware", () => {
  const req = {} as Request;
  const next = vi.fn() as NextFunction;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles ApiError with correct status code and message", () => {
    const error = ApiError.notFound("Room not found");
    const res = createMockRes();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Room not found",
      })
    );
  });

  it("handles ApiError.unauthorized with 401", () => {
    const error = ApiError.unauthorized("No token");
    const res = createMockRes();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("handles unknown errors with 500", () => {
    const error = new Error("Something broke");
    const res = createMockRes();

    errorHandler(error, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Internal server error",
      })
    );
  });

  it("does not leak error details in production", () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    const error = new Error("DB connection string exposed");
    const res = createMockRes();

    errorHandler(error, req, res, next);

    const response = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(response.message).toBe("Internal server error");
    expect(response.stack).toBeUndefined();
    expect(response.originalMessage).toBeUndefined();

    process.env.NODE_ENV = originalEnv;
  });
});
