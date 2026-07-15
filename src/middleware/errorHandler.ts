import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/ApiError.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(process.env.NODE_ENV === "development" && {
        stack: err.stack,
      }),
    });
    return;
  }

  // Log unexpected errors with full context
  logger.error(err, "Unhandled error");

  res.status(500).json({
    success: false,
    message: "Internal server error",
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
      originalMessage: err.message,
    }),
  });
}

