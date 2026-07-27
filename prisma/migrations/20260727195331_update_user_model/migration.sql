/*
  Warnings:

  - You are about to drop the column `password_reset_token` on the `users` table. All the data in the column will be lost.
  - The `gender` column on the `users` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- AlterTable
ALTER TABLE "users" DROP COLUMN "password_reset_token",
ADD COLUMN     "passwordResetToken" TEXT,
ALTER COLUMN "passwordHash" DROP NOT NULL,
DROP COLUMN "gender",
ADD COLUMN     "gender" "Gender";
