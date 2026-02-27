import { Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { ApiError } from "../utils/ApiError.js";
import { AuthenticatedRequest } from "../types/index.js";

export function authenticate(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw ApiError.unauthorized("Missing or invalid authorization header");
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      throw ApiError.unauthorized("Token not provided");
    }

    const payload = verifyAccessToken(token);
    req.user = {
      userId: payload.userId,
      email: payload.email,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      next(error);
      return;
    }
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}
