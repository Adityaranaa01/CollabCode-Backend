import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/index.js";
import * as executionService from "../services/execution.service.js";
import { ApiError } from "../utils/ApiError.js";

export async function runCode(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const { language, sourceCode, stdin } = req.body;

    if (!language || typeof language !== "string") {
      throw ApiError.badRequest("Language is required");
    }

    if (!sourceCode || typeof sourceCode !== "string") {
      throw ApiError.badRequest("Source code is required");
    }

    if (sourceCode.length > 50000) {
      throw ApiError.badRequest("Source code is too large (max 50KB)");
    }

    const result = await executionService.executeCode(language, sourceCode, stdin);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
