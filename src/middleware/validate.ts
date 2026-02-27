import { Request, Response, NextFunction } from "express";
import { ZodType, ZodError } from "zod";
import { ApiError } from "../utils/ApiError.js";

type ValidationTarget = "body" | "query" | "params";

export function validate(
  schema: ZodType,
  target: ValidationTarget = "body"
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req[target]);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const messages = error.issues
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        next(ApiError.badRequest(`Validation error: ${messages}`));
        return;
      }
      next(error);
    }
  };
}
