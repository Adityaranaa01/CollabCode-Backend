import { describe, it, expect } from "vitest";
import { ApiError } from "../../src/utils/ApiError.js";

describe("ApiError", () => {
  it("creates an error with status code and message", () => {
    const error = new ApiError(400, "Bad input");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.statusCode).toBe(400);
    expect(error.message).toBe("Bad input");
    expect(error.isOperational).toBe(true);
    expect(error.stack).toBeDefined();
  });

  it("marks non-operational errors correctly", () => {
    const error = new ApiError(500, "Crash", false);
    expect(error.isOperational).toBe(false);
  });

  describe("factory methods", () => {
    it("badRequest creates a 400 error", () => {
      const error = ApiError.badRequest("Invalid email");
      expect(error.statusCode).toBe(400);
      expect(error.message).toBe("Invalid email");
    });

    it("badRequest uses default message", () => {
      const error = ApiError.badRequest();
      expect(error.message).toBe("Bad request");
    });

    it("unauthorized creates a 401 error", () => {
      const error = ApiError.unauthorized("No token");
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe("No token");
    });

    it("forbidden creates a 403 error", () => {
      const error = ApiError.forbidden("Not allowed");
      expect(error.statusCode).toBe(403);
    });

    it("notFound creates a 404 error", () => {
      const error = ApiError.notFound("Room not found");
      expect(error.statusCode).toBe(404);
    });

    it("conflict creates a 409 error", () => {
      const error = ApiError.conflict("Email exists");
      expect(error.statusCode).toBe(409);
    });

    it("tooManyRequests creates a 429 error", () => {
      const error = ApiError.tooManyRequests();
      expect(error.statusCode).toBe(429);
    });

    it("internal creates a 500 non-operational error", () => {
      const error = ApiError.internal();
      expect(error.statusCode).toBe(500);
      expect(error.isOperational).toBe(false);
    });
  });
});
