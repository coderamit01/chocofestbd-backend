/*
  Warnings:

  - You are about to drop the column `productReviewId` on the `order_items` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "order_items" DROP CONSTRAINT "order_items_productReviewId_fkey";

-- AlterTable
ALTER TABLE "order_items" DROP COLUMN "productReviewId";

-- AlterTable
ALTER TABLE "product_reviews" ADD COLUMN     "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false;
