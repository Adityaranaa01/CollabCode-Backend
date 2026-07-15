import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * Redis client singleton.
 * 
 * ioredis is used over the `redis` (node-redis) package because:
 * 1. It auto-reconnects with exponential backoff out of the box
 * 2. It supports Cluster mode without a separate package
 * 3. BullMQ and @socket.io/redis-adapter both recommend ioredis
 * 4. It handles command buffering during reconnection (no lost commands)
 * 
 * The `maxRetriesPerRequest: null` setting is required by BullMQ —
 * it prevents ioredis from throwing after 20 failed retries on a single
 * command, which would crash BullMQ workers during transient Redis outages.
 */
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  retryStrategy(times: number) {
    // Exponential backoff: 50ms, 100ms, 200ms... capped at 2 seconds
    const delay = Math.min(times * 50, 2000);
    return delay;
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

/**
 * Creates a duplicate Redis connection.
 * Required by Socket.IO Redis adapter (needs separate pub/sub clients)
 * and useful for BullMQ (separate connection per worker).
 */
export function createRedisClient(): Redis {
  return redis.duplicate();
}
