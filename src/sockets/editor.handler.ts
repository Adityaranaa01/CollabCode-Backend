import { Server } from "socket.io";
import { AuthenticatedSocket } from "./index.js";
import { activeRooms, schedulePersist } from "./room-store.js";

const MAX_PATCH_SIZE = 50 * 1024; // 50KB

export function registerEditorHandlers(
  _io: Server,
  socket: AuthenticatedSocket
): void {
  const userId = socket.data.userId;

  socket.on(
    "room:edit",
    (data: { roomId: string; patch: string; version: number }) => {
      try {
        if (!data?.roomId || typeof data.patch !== "string" || typeof data.version !== "number") {
          socket.emit("error", {
            event: "room:edit",
            message: "Invalid edit payload",
          });
          return;
        }

        if (data.patch.length > MAX_PATCH_SIZE) {
          socket.emit("error", {
            event: "room:edit",
            message: `Patch too large (max ${MAX_PATCH_SIZE / 1024}KB)`,
          });
          return;
        }

        const room = activeRooms.get(data.roomId);
        if (!room) {
          socket.emit("error", {
            event: "room:edit",
            message: "Room not loaded. Join the room first.",
          });
          return;
        }

        if (!room.users.has(userId)) {
          socket.emit("error", {
            event: "room:edit",
            message: "Not a participant in this room",
          });
          return;
        }

        if (data.version !== room.version) {
          socket.emit("room:resync", {
            roomId: data.roomId,
            document: room.document,
            version: room.version,
          });
          return;
        }

        room.document = data.patch;
        room.version += 1;

        socket.to(`room:${data.roomId}`).emit("room:edit", {
          roomId: data.roomId,
          patch: data.patch,
          version: room.version,
          userId,
        });

        schedulePersist(data.roomId);
      } catch (error) {
        console.error(`[Editor] edit error:`, error);
        socket.emit("error", {
          event: "room:edit",
          message: "Failed to apply edit",
        });
      }
    }
  );

  socket.on(
    "room:cursor",
    (data: { roomId: string; cursor: { line: number; ch: number } }) => {
      if (!data?.roomId) return;

      socket.to(`room:${data.roomId}`).emit("room:cursor-update", {
        userId,
        cursor: data.cursor,
      });
    }
  );
}
