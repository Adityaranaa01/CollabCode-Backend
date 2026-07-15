import { describe, it, expect } from "vitest";
import {
  signAccessToken,
  verifyAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryMs,
} from "../../src/utils/jwt.js";

describe("Access Tokens", () => {
  const payload = { userId: "user-123", email: "test@example.com" };

  it("signs and verifies an access token", () => {
    const token = signAccessToken(payload);
    expect(token).toBeDefined();
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // JWT has 3 parts

    const decoded = verifyAccessToken(token);
    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.email).toBe(payload.email);
  });

  it("produces different tokens for different payloads", () => {
    const token1 = signAccessToken({ userId: "user-1", email: "a@test.com" });
    const token2 = signAccessToken({ userId: "user-2", email: "b@test.com" });
    expect(token1).not.toBe(token2);
  });

  it("throws on an invalid token", () => {
    expect(() => verifyAccessToken("invalid.token.here")).toThrow();
  });

  it("throws on a token signed with a different secret", () => {
    // A refresh token should not verify as an access token
    const refreshToken = signRefreshToken({ sub: "user-1", tokenId: "tok-1" });
    expect(() => verifyAccessToken(refreshToken)).toThrow();
  });
});

describe("Refresh Tokens", () => {
  const payload = { sub: "user-456", tokenId: "token-789" };

  it("signs and verifies a refresh token", () => {
    const token = signRefreshToken(payload);
    expect(token).toBeDefined();

    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.tokenId).toBe(payload.tokenId);
  });

  it("throws on an invalid refresh token", () => {
    expect(() => verifyRefreshToken("bad-token")).toThrow();
  });

  it("throws when verifying an access token as a refresh token", () => {
    const accessToken = signAccessToken({ userId: "user-1", email: "a@test.com" });
    expect(() => verifyRefreshToken(accessToken)).toThrow();
  });
});

describe("getRefreshTokenExpiryMs", () => {
  it("returns a positive number in milliseconds", () => {
    const ms = getRefreshTokenExpiryMs();
    expect(ms).toBeGreaterThan(0);
    // "7d" = 7 * 86400 * 1000 = 604800000
    expect(ms).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
