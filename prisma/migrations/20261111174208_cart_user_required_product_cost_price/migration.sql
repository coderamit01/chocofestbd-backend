/*
  Warnings:

  - Made the column `userId` on table `carts` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "carts" ALTER COLUMN "userId" SET NOT NULL;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "costPrice" DECIMAL(12,2),
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
