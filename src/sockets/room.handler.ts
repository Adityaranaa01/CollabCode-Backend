import { Server } from "socket.io";
import { AuthenticatedSocket } from "./index.js";
import { validateMembership } from "../services/room.service.js";
import { createMessage } from "../services/message.service.js";
import {
  activeRooms,
  getOrCreateRoom,
  persistAndRemoveRoom,
} from "./room-store.js";

const MAX_MESSAGE_LENGTH = 2000;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX = 5;

const chatRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkChatRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = chatRateLimits.get(userId);

  if (!entry || now >= entry.resetAt) {
    chatRateLimits.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
}

function getParticipants(roomId: string): Array<{ userId: string; socketId: string }> {
  const room = activeRooms.get(roomId);
  if (!room) return [];

  return Array.from(room.users.entries()).map(([userId, socketId]) => ({
    userId,
    socketId,
  }));
}

export function registerRoomHandlers(
  io: Server,
  socket: AuthenticatedSocket
): void {
  const userId = socket.data.userId;

  socket.on("room:join", async (roomId: string) => {
    try {
      if (!roomId || typeof roomId !== "string") return;

      const isMember = await validateMembership(userId, roomId);
      if (!isMember) {
        socket.emit("error", {
          event: "room:join",
          message: "Not a member of this room",
        });
        return;
      }

      const room = await getOrCreateRoom(roomId);
      room.users.set(userId, socket.id);

      await socket.join(`room:${roomId}`);

      socket.emit("room:joined", {
        roomId,
        document: room.document,
        version: room.version,
        participants: getParticipants(roomId),
      });

      socket.to(`room:${roomId}`).emit("room:presence", {
        participants: getParticipants(roomId),
      });

      console.log(`[Socket] User ${userId} joined room ${roomId}`);
    } catch (error) {
      console.error(`[Socket] room:join error:`, error);
      socket.emit("error", {
        event: "room:join",
        message: "Failed to join room",
      });
    }
  });

  socket.on("room:leave", async (roomId: string) => {
    try {
      if (!roomId || typeof roomId !== "string") return;

      await handleLeaveRoom(io, socket, userId, roomId);
    } catch (error) {
      console.error(`[Socket] room:leave error:`, error);
    }
  });

  socket.on(
    "room:chat",
    async (data: { roomId: string; content: string }) => {
      try {
        if (!data?.roomId || !data?.content) return;
        const content = data.content.trim();

        if (content.length === 0) return;
        if (content.length > MAX_MESSAGE_LENGTH) {
          socket.emit("error", {
            event: "room:chat",
            message: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)`,
          });
          return;
        }

        if (!checkChatRateLimit(userId)) {
          socket.emit("error", {
            event: "room:chat",
            message: "Slow down. Max 5 messages per second.",
          });
          return;
        }

        const message = await createMessage(data.roomId, userId, content);
        io.to(`room:${data.roomId}`).emit("room:new-message", message);
      } catch (error) {
        console.error(`[Socket] room:chat error:`, error);
        socket.emit("error", {
          event: "room:chat",
          message: "Failed to send message",
        });
      }
    }
  );

  socket.on("room:force-leave", async (roomId: string) => {
    await socket.leave(`room:${roomId}`);
    socket.emit("room:kicked", { roomId });
  });
}

export async function handleLeaveRoom(
  _io: Server,
  socket: AuthenticatedSocket,
  userId: string,
  roomId: string
): Promise<void> {
  const room = activeRooms.get(roomId);
  if (room) {
    room.users.delete(userId);

    socket.to(`room:${roomId}`).emit("room:presence", {
      participants: getParticipants(roomId),
    });

    if (room.users.size === 0) {
      await persistAndRemoveRoom(roomId);
      console.log(`[Socket] Room ${roomId} emptied, persisted and unloaded`);
    }
  }

  await socket.leave(`room:${roomId}`);
  console.log(`[Socket] User ${userId} left room ${roomId}`);
}
