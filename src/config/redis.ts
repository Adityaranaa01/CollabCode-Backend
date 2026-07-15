import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/*
Redis client singleton.
*/
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    return Math.min(times * 50, 2000);
  },
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis connection error");
});

redis.on("close", () => {
  logger.warn("Redis connection closed");
});

/*
Creates a duplicate Redis client.
*/
export function createRedisClient(): Redis {
  return redis.duplicate();
}
