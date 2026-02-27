import { prisma } from "../utils/prisma.js";

const PERSIST_DELAY_MS = 2500;

export interface ActiveRoom {
  document: string;
  version: number;
  users: Map<string, string>;
  persistTimeout?: ReturnType<typeof setTimeout>;
}

export const activeRooms = new Map<string, ActiveRoom>();

export async function getOrCreateRoom(roomId: string): Promise<ActiveRoom> {
  const existing = activeRooms.get(roomId);
  if (existing) return existing;

  let doc = await prisma.codeDocument.findUnique({
    where: { roomId },
  });

  if (!doc) {
    doc = await prisma.codeDocument.create({
      data: { roomId, content: "", version: 0 },
    });
  }

  const room: ActiveRoom = {
    document: doc.content,
    version: doc.version,
    users: new Map(),
  };

  activeRooms.set(roomId, room);
  return room;
}

export function schedulePersist(roomId: string): void {
  const room = activeRooms.get(roomId);
  if (!room) return;

  if (room.persistTimeout) {
    clearTimeout(room.persistTimeout);
  }

  room.persistTimeout = setTimeout(async () => {
    await persistRoom(roomId);
  }, PERSIST_DELAY_MS);
}

export async function persistRoom(roomId: string): Promise<void> {
  const room = activeRooms.get(roomId);
  if (!room) return;

  if (room.persistTimeout) {
    clearTimeout(room.persistTimeout);
    room.persistTimeout = undefined;
  }

  try {
    await prisma.codeDocument.update({
      where: { roomId },
      data: {
        content: room.document,
        version: room.version,
      },
    });
  } catch (error) {
    console.error(`[Store] Failed to persist document for room ${roomId}:`, error);
  }
}

export async function persistAndRemoveRoom(roomId: string): Promise<void> {
  await persistRoom(roomId);
  activeRooms.delete(roomId);
}
