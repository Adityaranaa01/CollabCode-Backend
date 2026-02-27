import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { hashPassword, comparePassword, sha256, safeCompare } from "../utils/hash.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  getRefreshTokenExpiryMs,
} from "../utils/jwt.js";
import { TokenPair } from "../types/index.js";

export async function register(
  email: string,
  password: string,
  displayName: string
): Promise<TokenPair> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw ApiError.conflict("Email already registered");
  }

  let freePlan = await prisma.subscriptionPlan.findUnique({
    where: { name: "FREE" },
  });

  if (!freePlan) {
    freePlan = await prisma.subscriptionPlan.create({
      data: {
        name: "FREE",
        maxRooms: 3,
        maxMembersPerRoom: 5,
        maxJoinedRooms: 10,
        chatRetentionDays: 7,
        maxActiveSessions: 0,
      },
    });
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName,
      planId: freePlan.id,
    },
    include: { plan: true },
  });

  return issueTokenPair(user.id, user.email, user.plan.maxActiveSessions);
}

export async function login(
  email: string,
  password: string
): Promise<TokenPair> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { plan: true },
  });

  if (!user) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  const isValid = await comparePassword(password, user.passwordHash);

  if (!isValid) {
    throw ApiError.unauthorized("Invalid email or password");
  }

  return issueTokenPair(user.id, user.email, user.plan.maxActiveSessions);
}

export async function refreshTokens(
  rawRefreshToken: string
): Promise<TokenPair> {
  let payload;
  try {
    payload = verifyRefreshToken(rawRefreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const { sub: userId, tokenId } = payload;

  const storedToken = await prisma.refreshToken.findUnique({
    where: { id: tokenId },
    include: { user: { include: { plan: true } } },
  });

  if (!storedToken) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    throw ApiError.unauthorized("Refresh token reuse detected, all sessions revoked");
  }

  if (storedToken.userId !== userId) {
    await prisma.refreshToken.deleteMany({ where: { userId: storedToken.userId } });
    throw ApiError.unauthorized("Token mismatch, all sessions revoked");
  }

  const incomingHash = sha256(rawRefreshToken);
  if (!safeCompare(incomingHash, storedToken.tokenHash)) {
    await prisma.refreshToken.deleteMany({ where: { userId } });
    throw ApiError.unauthorized("Token hash mismatch, all sessions revoked");
  }

  if (storedToken.expiresAt < new Date()) {
    await prisma.refreshToken.delete({ where: { id: tokenId } });
    throw ApiError.unauthorized("Refresh token expired");
  }

  await prisma.refreshToken.delete({ where: { id: tokenId } });

  return issueTokenPair(
    storedToken.userId,
    storedToken.user.email,
    storedToken.user.plan.maxActiveSessions
  );
}

export async function logout(rawRefreshToken: string): Promise<void> {
  try {
    const payload = verifyRefreshToken(rawRefreshToken);
    await prisma.refreshToken.delete({
      where: { id: payload.tokenId },
    }).catch(() => {});
  } catch {
    // invalid JWT, nothing to delete
  }
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}

export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
  return result.count;
}

async function issueTokenPair(
  userId: string,
  email: string,
  maxActiveSessions: number
): Promise<TokenPair> {
  if (maxActiveSessions > 0) {
    const activeCount = await prisma.refreshToken.count({
      where: { userId, expiresAt: { gt: new Date() } },
    });

    if (activeCount >= maxActiveSessions) {
      await prisma.refreshToken.deleteMany({ where: { userId } });
    }
  }

  const expiresAt = new Date(Date.now() + getRefreshTokenExpiryMs());

  const tokenRecord = await prisma.refreshToken.create({
    data: {
      userId,
      expiresAt,
      tokenHash: "",
    },
  });

  const refreshJwt = signRefreshToken({
    sub: userId,
    tokenId: tokenRecord.id,
  });

  const tokenHash = sha256(refreshJwt);
  await prisma.refreshToken.update({
    where: { id: tokenRecord.id },
    data: { tokenHash },
  });

  const accessToken = signAccessToken({ userId, email });

  return {
    accessToken,
    refreshToken: refreshJwt,
  };
}
