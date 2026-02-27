import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";

export async function createMessage(
  roomId: string,
  userId: string,
  content: string
) {
  // Verify membership before allowing message
  const membership = await prisma.roomMembership.findUnique({
    where: { userId_roomId: { userId, roomId } },
  });

  if (!membership) {
    throw ApiError.forbidden("You must be a member of the room to send messages");
  }

  return prisma.message.create({
    data: {
      content,
      roomId,
      userId,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
  });
}

export async function getRecentMessages(
  roomId: string,
  cursor?: string,
  limit = 50
) {
  const messages = await prisma.message.findMany({
    where: {
      roomId,
      ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const nextCursor =
    messages.length === limit
      ? messages[messages.length - 1].createdAt.toISOString()
      : null;

  return { messages, nextCursor };
}

/**
 * Retention cleanup — deletes messages older than the plan's retention period.
 * Should be called by a cron job.
 */
export async function cleanExpiredMessages(): Promise<number> {
  const plans = await prisma.subscriptionPlan.findMany({
    where: { chatRetentionDays: { gt: 0 } }, // Exclude unlimited (-1)
  });

  let totalDeleted = 0;

  for (const plan of plans) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - plan.chatRetentionDays);

    // Batch delete to avoid long-running transactions
    let deleted: number;
    do {
      deleted = await prisma.$executeRaw`
        DELETE FROM messages WHERE id IN (
          SELECT m.id FROM messages m
          JOIN rooms r ON m."roomId" = r.id
          JOIN users u ON r."ownerId" = u.id
          WHERE u."planId" = ${plan.id}
            AND m."createdAt" < ${cutoff}
          LIMIT 1000
        )
      `;
      totalDeleted += deleted;
    } while (deleted === 1000);
  }

  return totalDeleted;
}
