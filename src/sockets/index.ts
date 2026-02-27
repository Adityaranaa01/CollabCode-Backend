import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt.js";
import { env } from "../config/env.js";
import { registerRoomHandlers, handleLeaveRoom } from "./room.handler.js";
import { registerEditorHandlers } from "./editor.handler.js";
import { activeRooms } from "./room-store.js";

interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
    email: string;
  };
}

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CLIENT_URL,
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = verifyAccessToken(token);
      (socket as AuthenticatedSocket).data = {
        userId: payload.userId,
        email: payload.email,
      };
      next();
    } catch {
      return next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const authSocket = socket as AuthenticatedSocket;
    const userId = authSocket.data.userId;
    console.log(`[Socket] User ${userId} connected (${authSocket.id})`);

    registerRoomHandlers(io, authSocket);
    registerEditorHandlers(io, authSocket);

    socket.on("disconnect", async (reason) => {
      console.log(`[Socket] User ${userId} disconnected: ${reason}`);

      for (const [roomId, room] of activeRooms) {
        if (room.users.has(userId)) {
          await handleLeaveRoom(io, authSocket, userId, roomId);
        }
      }
    });
  });

  return io;
}

export type { AuthenticatedSocket };
