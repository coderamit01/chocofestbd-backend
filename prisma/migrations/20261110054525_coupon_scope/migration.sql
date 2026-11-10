/*
  Warnings:

  - You are about to drop the column `description` on the `coupons` table. All the data in the column will be lost.
  - You are about to drop the `coupon_redemptions` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "CouponScope" AS ENUM ('ALL', 'PRODUCTS', 'CATEGORIES');

-- DropForeignKey
ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_couponId_fkey";

-- DropForeignKey
ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_orderId_fkey";

-- DropForeignKey
ALTER TABLE "coupon_redemptions" DROP CONSTRAINT "coupon_redemptions_userId_fkey";

-- AlterTable
ALTER TABLE "coupons" DROP COLUMN "description",
ADD COLUMN     "excludeSaleItems" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scope" "CouponScope" NOT NULL DEFAULT 'ALL';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "coupon_redemptions";

-- CreateTable
CREATE TABLE "coupon_products" (
    "couponId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("couponId","productId")
);

-- CreateTable
CREATE TABLE "coupon_categories" (
    "couponId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("couponId","categoryId")
);

-- CreateIndex
CREATE INDEX "coupon_products_productId_idx" ON "coupon_products"("productId");

-- CreateIndex
CREATE INDEX "coupon_categories_categoryId_idx" ON "coupon_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
