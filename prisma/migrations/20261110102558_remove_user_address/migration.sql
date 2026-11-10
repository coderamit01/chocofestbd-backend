/*
  Warnings:

  - You are about to drop the column `thana` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `thana` on the `orders` table. All the data in the column will be lost.
  - Added the required column `area` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `area` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "addresses" DROP COLUMN "thana",
ADD COLUMN     "area" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "thana",
ADD COLUMN     "area" TEXT NOT NULL;
