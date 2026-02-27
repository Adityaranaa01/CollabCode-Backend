import { Request } from "express";
import { MemberRole } from "@prisma/client";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export interface RoomWithOwnerPlan {
  id: string;
  name: string;
  language: string;
  isPublic: boolean;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
  owner: {
    id: string;
    displayName: string;
    plan: {
      maxMembersPerRoom: number;
      maxRooms: number;
      chatRetentionDays: number;
    };
  };
  _count?: {
    memberships: number;
  };
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface JoinRoomResult {
  roomId: string;
  role: MemberRole;
}

export interface PaginationParams {
  cursor?: string;
  limit: number;
}
