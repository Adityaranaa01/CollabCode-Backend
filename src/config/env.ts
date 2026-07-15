import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),
  JWT_SECRET: z
    .string()
    .min(1, "JWT_SECRET is required"),
  REFRESH_TOKEN_SECRET: z
    .string()
    .min(1, "REFRESH_TOKEN_SECRET is required"),
  JWT_EXPIRES_IN: z
    .string()
    .default("15m"),
  REFRESH_TOKEN_EXPIRES_IN: z
    .string()
    .default("7d"),
  PORT: z
    .string()
    .default("4000")
    .transform(Number)
    .pipe(z.number().int().positive()),
  CLIENT_URL: z
    .string()
    .default("http://localhost:3000"),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid environment variables:\n${JSON.stringify(parsed.error.format(), null, 2)}\n`
  );
  process.exit(1);
}

export const env = parsed.data;
