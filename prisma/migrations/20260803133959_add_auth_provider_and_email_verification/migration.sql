/*
  Warnings:

  - The values [NULL] on the enum `ChatSeverity` will be removed. If these variants are still used in the database, this will fail.
  - A unique constraint covering the columns `[googleId]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('LOCAL', 'GOOGLE');

-- AlterEnum
BEGIN;
CREATE TYPE "ChatSeverity_new" AS ENUM ('LOW', 'MODERATE', 'HIGH');
ALTER TABLE "public"."chat_messages" ALTER COLUMN "severity" DROP DEFAULT;
ALTER TABLE "chat_messages" ALTER COLUMN "severity" TYPE "ChatSeverity_new" USING ("severity"::text::"ChatSeverity_new");
ALTER TYPE "ChatSeverity" RENAME TO "ChatSeverity_old";
ALTER TYPE "ChatSeverity_new" RENAME TO "ChatSeverity";
DROP TYPE "public"."ChatSeverity_old";
COMMIT;

-- AlterTable
ALTER TABLE "chat_messages" ALTER COLUMN "severity" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "authProvider" "AuthProvider" NOT NULL DEFAULT 'LOCAL',
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "googleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_googleId_key" ON "users"("googleId");
