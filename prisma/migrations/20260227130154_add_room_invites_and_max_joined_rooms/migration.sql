-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "maxJoinedRooms" INTEGER NOT NULL DEFAULT 10;

-- CreateTable
CREATE TABLE "room_invites" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_invites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "room_invites_roomId_idx" ON "room_invites"("roomId");

-- CreateIndex
CREATE INDEX "room_invites_expiresAt_idx" ON "room_invites"("expiresAt");

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_invites" ADD CONSTRAINT "room_invites_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
