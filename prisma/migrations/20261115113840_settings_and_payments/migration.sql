/*
  Warnings:

  - A unique constraint covering the columns `[paymentMethod,paymentTransactionId]` on the table `orders` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'ROCKET';
ALTER TYPE "PaymentMethod" ADD VALUE 'BANK_TRANSFER';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "paymentSender" TEXT,
ADD COLUMN     "paymentTransactionId" TEXT,
ADD COLUMN     "paymentVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "paymentVerifiedById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_paymentMethod_paymentTransactionId_key" ON "orders"("paymentMethod", "paymentTransactionId");
