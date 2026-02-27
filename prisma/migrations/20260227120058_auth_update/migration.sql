/*
  Warnings:

  - You are about to drop the column `revokedAt` on the `refresh_tokens` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "refresh_tokens_tokenHash_key";

-- AlterTable
ALTER TABLE "refresh_tokens" DROP COLUMN "revokedAt";

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "maxActiveSessions" INTEGER NOT NULL DEFAULT 0;
