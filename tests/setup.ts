/**
 * Global test setup.
 * Sets required environment variables before any test module loads.
 * This runs BEFORE the env.ts Zod validation, so all required vars must be present.
 */
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/collabcode_test";
process.env.JWT_SECRET = "test-jwt-secret-do-not-use-in-production";
process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-do-not-use-in-production";
process.env.JWT_EXPIRES_IN = "15m";
process.env.REFRESH_TOKEN_EXPIRES_IN = "7d";
process.env.PORT = "4001";
process.env.CLIENT_URL = "http://localhost:3000";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.NODE_ENV = "test";
