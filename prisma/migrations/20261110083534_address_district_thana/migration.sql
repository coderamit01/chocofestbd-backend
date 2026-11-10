/*
  Warnings:

  - You are about to drop the column `area` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `addresses` table. All the data in the column will be lost.
  - You are about to drop the column `area` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `city` on the `orders` table. All the data in the column will be lost.
  - Added the required column `district` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thana` to the `addresses` table without a default value. This is not possible if the table is not empty.
  - Added the required column `district` to the `orders` table without a default value. This is not possible if the table is not empty.
  - Added the required column `thana` to the `orders` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "addresses" DROP COLUMN "area",
DROP COLUMN "city",
ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "thana" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "area",
DROP COLUMN "city",
ADD COLUMN     "district" TEXT NOT NULL,
ADD COLUMN     "thana" TEXT NOT NULL;
