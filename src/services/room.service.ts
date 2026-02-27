import crypto from "crypto";
import { MemberRole } from "@prisma/client";
import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { sha256 } from "../utils/hash.js";

const INVITE_EXPIRY_DAYS = 7;

export async function createRoom(
  ownerId: string,
  name: string,
  language: string,
  isPublic: boolean
) {
  const user = await prisma.user.findUnique({
    where: { id: ownerId },
    include: {
      plan: true,
      _count: { select: { rooms: true } },
    },
  });

  if (!user) {
    throw ApiError.notFound("User not found");
  }

  if (user._count.rooms >= user.plan.maxRooms) {
    throw ApiError.forbidden(
      `Room limit reached. Your ${user.plan.name} plan allows ${user.plan.maxRooms} rooms.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const newRoom = await tx.room.create({
      data: { name, language, isPublic, ownerId },
    });

    await tx.codeDocument.create({
      data: { roomId: newRoom.id, content: "", version: 0 },
    });

    await tx.roomMembership.create({
      data: {
        userId: ownerId,
        roomId: newRoom.id,
        role: MemberRole.OWNER,
      },
    });

    return newRoom;
  });
}

export async function getRoomById(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: {
      owner: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          plan: {
            select: {
              name: true,
              maxMembersPerRoom: true,
            },
          },
        },
      },
      _count: { select: { memberships: true } },
    },
  });

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  return room;
}

export async function joinRoom(userId: string, roomId: string) {
  return prisma.$transaction(async (tx) => {
    const roomData = await tx.$queryRaw<
      Array<{ id: string; isPublic: boolean; maxMembersPerRoom: number }>
    >`
      SELECT r.id, r."isPublic", sp."maxMembersPerRoom"
      FROM rooms r
      JOIN users u ON r."ownerId" = u.id
      JOIN subscription_plans sp ON u."planId" = sp.id
      WHERE r.id = ${roomId}
      FOR UPDATE OF r
    `;

    if (!roomData.length) {
      throw ApiError.notFound("Room not found");
    }

    const room = roomData[0];

    const existingMembership = await tx.roomMembership.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });

    if (existingMembership) {
      throw ApiError.conflict("Already a member of this room");
    }

    if (!room.isPublic) {
      throw ApiError.forbidden("This is a private room. You need an invitation to join.");
    }

    await enforceJoinLimits(tx, userId, roomId, room.maxMembersPerRoom);

    return tx.roomMembership.create({
      data: { userId, roomId, role: MemberRole.MEMBER },
    });
  });
}

export async function createInvite(userId: string, roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  if (room.ownerId !== userId) {
    throw ApiError.forbidden("Only the room owner can create invites");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  await prisma.roomInvite.create({
    data: {
      roomId,
      tokenHash,
      expiresAt,
      createdBy: userId,
    },
  });

  return { token: rawToken, expiresAt };
}

export async function joinByInvite(userId: string, rawToken: string) {
  const tokenHash = sha256(rawToken);

  const invite = await prisma.roomInvite.findFirst({
    where: { tokenHash },
    include: {
      room: {
        include: {
          owner: {
            include: { plan: true },
          },
        },
      },
    },
  });

  if (!invite) {
    throw ApiError.notFound("Invalid invite token");
  }

  if (invite.expiresAt < new Date()) {
    throw ApiError.forbidden("Invite has expired");
  }

  return prisma.$transaction(async (tx) => {
    const existingMembership = await tx.roomMembership.findUnique({
      where: { userId_roomId: { userId, roomId: invite.roomId } },
    });

    if (existingMembership) {
      throw ApiError.conflict("Already a member of this room");
    }

    await enforceJoinLimits(
      tx,
      userId,
      invite.roomId,
      invite.room.owner.plan.maxMembersPerRoom
    );

    return tx.roomMembership.create({
      data: {
        userId,
        roomId: invite.roomId,
        role: MemberRole.MEMBER,
      },
      include: {
        room: {
          select: { id: true, name: true, language: true },
        },
      },
    });
  });
}

export async function removeMember(
  ownerId: string,
  roomId: string,
  targetUserId: string
) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  if (room.ownerId !== ownerId) {
    throw ApiError.forbidden("Only the room owner can remove members");
  }

  if (targetUserId === ownerId) {
    throw ApiError.badRequest("Owner cannot be removed from their own room");
  }

  const membership = await prisma.roomMembership.findUnique({
    where: { userId_roomId: { userId: targetUserId, roomId } },
  });

  if (!membership) {
    throw ApiError.notFound("User is not a member of this room");
  }

  await prisma.roomMembership.delete({
    where: { id: membership.id },
  });

  return { removedUserId: targetUserId, roomId };
}

export async function deleteRoom(ownerId: string, roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  if (room.ownerId !== ownerId) {
    throw ApiError.forbidden("Only the room owner can delete the room");
  }

  await prisma.room.delete({ where: { id: roomId } });

  return { deletedRoomId: roomId };
}

export async function getDashboard(
  userId: string,
  publicCursor?: string,
  publicLimit = 20
) {
  const roomSelect = {
    id: true,
    name: true,
    language: true,
    isPublic: true,
    createdAt: true,
    owner: {
      select: { id: true, displayName: true, avatarUrl: true },
    },
    _count: { select: { memberships: true } },
  } as const;

  const [ownedRooms, joinedRooms, membershipRoomIds] = await Promise.all([
    prisma.room.findMany({
      where: { ownerId: userId },
      select: roomSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.room.findMany({
      where: {
        memberships: { some: { userId, role: MemberRole.MEMBER } },
        ownerId: { not: userId },
      },
      select: roomSelect,
      orderBy: { createdAt: "desc" },
    }),
    prisma.roomMembership.findMany({
      where: { userId },
      select: { roomId: true },
    }),
  ]);

  const joinedIds = new Set(membershipRoomIds.map((m) => m.roomId));

  const publicRooms = await prisma.room.findMany({
    where: {
      isPublic: true,
      id: { notIn: [...joinedIds] },
      ...(publicCursor ? { createdAt: { lt: new Date(publicCursor) } } : {}),
    },
    select: roomSelect,
    orderBy: { createdAt: "desc" },
    take: publicLimit,
  });

  const nextCursor =
    publicRooms.length === publicLimit
      ? publicRooms[publicRooms.length - 1].createdAt.toISOString()
      : null;

  return {
    ownedRooms,
    joinedRooms,
    publicRooms: { rooms: publicRooms, nextCursor },
  };
}

export async function getRoomMembers(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
  });

  if (!room) {
    throw ApiError.notFound("Room not found");
  }

  return prisma.roomMembership.findMany({
    where: { roomId },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          email: true,
        },
      },
    },
    orderBy: { joinedAt: "asc" },
  });
}

export async function validateMembership(
  userId: string,
  roomId: string
): Promise<boolean> {
  const membership = await prisma.roomMembership.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });
  return !!membership;
}

async function enforceJoinLimits(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  roomId: string,
  maxMembersPerRoom: number
) {
  const joiner = await tx.user.findUnique({
    where: { id: userId },
    include: {
      plan: true,
      _count: { select: { memberships: true } },
    },
  });

  if (!joiner) {
    throw ApiError.notFound("User not found");
  }

  if (joiner._count.memberships >= joiner.plan.maxJoinedRooms) {
    throw ApiError.forbidden(
      `Join limit reached. Your ${joiner.plan.name} plan allows joining ${joiner.plan.maxJoinedRooms} rooms.`
    );
  }

  const memberCount = await tx.roomMembership.count({
    where: { roomId },
  });

  if (memberCount >= maxMembersPerRoom) {
    throw ApiError.forbidden("Room is full");
  }
}
