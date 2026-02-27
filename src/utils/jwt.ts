import jwt, { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  userId: string;
  email: string;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
}

function parseExpiry(value: string): number {
  const match = value.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return 900;

  const num = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "s": return num;
    case "m": return num * 60;
    case "h": return num * 3600;
    case "d": return num * 86400;
    default: return 900;
  }
}

export function signAccessToken(payload: AccessTokenPayload): string {
  const options: SignOptions = {
    expiresIn: parseExpiry(env.JWT_EXPIRES_IN),
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(payload: RefreshTokenPayload): string {
  const options: SignOptions = {
    expiresIn: parseExpiry(env.REFRESH_TOKEN_EXPIRES_IN),
  };
  return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, options);
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(
    token,
    env.REFRESH_TOKEN_SECRET
  ) as RefreshTokenPayload;
}

export function getRefreshTokenExpiryMs(): number {
  return parseExpiry(env.REFRESH_TOKEN_EXPIRES_IN) * 1000;
}
