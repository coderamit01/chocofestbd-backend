-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('IN_STOCK', 'OUT_OF_STOCK');

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "manageStock" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "stockStatus" "StockStatus" NOT NULL DEFAULT 'IN_STOCK';
