import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/index.js";
import * as authService from "../services/auth.service.js";
import { ApiError } from "../utils/ApiError.js";
import { getRefreshTokenExpiryMs } from "../utils/jwt.js";
import { prisma } from "../utils/prisma.js";

function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
    maxAge: getRefreshTokenExpiryMs(),
  });
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/v1/auth",
  });
}

export async function register(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, displayName } = req.body;
    const tokens = await authService.register(email, password, displayName);

    setRefreshCookie(res, tokens.refreshToken);

    res.status(201).json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;
    const tokens = await authService.login(email, password);

    setRefreshCookie(res, tokens.refreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw ApiError.unauthorized("No refresh token provided");
    }

    const tokens = await authService.refreshTokens(refreshToken);

    setRefreshCookie(res, tokens.refreshToken);

    res.status(200).json({
      success: true,
      data: { accessToken: tokens.accessToken },
    });
  } catch (error) {
    clearRefreshCookie(res);
    next(error);
  }
}

export async function logout(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    clearRefreshCookie(res);

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
}

export async function logoutAll(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized();
    }

    await authService.logoutAll(req.user.userId);
    clearRefreshCookie(res);

    res.status(200).json({
      success: true,
      message: "All sessions logged out",
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw ApiError.unauthorized();
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarUrl: true,
        plan: {
          select: {
            name: true,
            maxRooms: true,
            maxMembersPerRoom: true,
            chatRetentionDays: true,
            maxActiveSessions: true,
          },
        },
        createdAt: true,
      },
    });

    if (!user) {
      throw ApiError.notFound("User not found");
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
}
