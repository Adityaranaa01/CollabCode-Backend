import pino from "pino";
import { env } from "../config/env.js";

export const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  ...(env.NODE_ENV === "development" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
});

/**
 * Create a child logger with contextual metadata.
 * Usage: const log = createChildLogger({ roomId, userId });
 */
export function createChildLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
