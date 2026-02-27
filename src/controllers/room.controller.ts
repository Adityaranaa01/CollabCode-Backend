import { Response, NextFunction } from "express";
import { AuthenticatedRequest } from "../types/index.js";
import * as roomService from "../services/room.service.js";
import * as messageService from "../services/message.service.js";
import { ApiError } from "../utils/ApiError.js";

function getParam(req: AuthenticatedRequest, name: string): string {
  const value = req.params[name];
  if (!value || Array.isArray(value)) {
    throw ApiError.badRequest(`Missing parameter: ${name}`);
  }
  return value;
}

export async function createRoom(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const { name, language, isPublic } = req.body;
    const room = await roomService.createRoom(
      req.user.userId,
      name,
      language,
      isPublic ?? false
    );

    res.status(201).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
}

export async function getRoom(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const room = await roomService.getRoomById(getParam(req, "id"));
    res.status(200).json({ success: true, data: room });
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(
      parseInt(String(req.query.limit || "20")) || 20,
      50
    );

    const data = await roomService.getDashboard(req.user.userId, cursor, limit);
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function joinRoom(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const membership = await roomService.joinRoom(
      req.user.userId,
      getParam(req, "id")
    );

    res.status(200).json({ success: true, data: membership });
  } catch (error) {
    next(error);
  }
}

export async function createInvite(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const invite = await roomService.createInvite(
      req.user.userId,
      getParam(req, "id")
    );

    res.status(201).json({ success: true, data: invite });
  } catch (error) {
    next(error);
  }
}

export async function joinByInvite(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const { token } = req.body;
    if (!token || typeof token !== "string") {
      throw ApiError.badRequest("Invite token is required");
    }

    const membership = await roomService.joinByInvite(req.user.userId, token);
    res.status(200).json({ success: true, data: membership });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const result = await roomService.removeMember(
      req.user.userId,
      getParam(req, "id"),
      getParam(req, "userId")
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function deleteRoom(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) throw ApiError.unauthorized();

    const result = await roomService.deleteRoom(
      req.user.userId,
      getParam(req, "id")
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function getRoomMembers(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const members = await roomService.getRoomMembers(getParam(req, "id"));
    res.status(200).json({ success: true, data: members });
  } catch (error) {
    next(error);
  }
}

export async function getRoomMessages(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
    const limit = Math.min(
      parseInt(String(req.query.limit || "50")) || 50,
      100
    );

    const result = await messageService.getRecentMessages(
      getParam(req, "id"),
      cursor,
      limit
    );

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}
