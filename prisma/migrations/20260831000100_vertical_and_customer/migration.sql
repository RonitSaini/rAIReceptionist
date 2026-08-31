-- Phase 1 of the vertical framework. Additive only: no table or column is renamed, altered or
-- dropped, so restaurants keep serving from exactly the tables they already use.
--
-- Account.vertical is NOT NULL with DEFAULT (restaurant): Postgres writes the default into every
-- existing row as part of the ADD COLUMN, so the backfill happens in this migration and no row can
-- ever exist without a profession.
--
-- Reservation.customerId / TakeoutOrder.customerId are nullable and deliberately left unfilled;
-- linking historic bookings to Customer rows is a data task, not a schema one.

-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('restaurant', 'plumbing', 'hvac', 'electrical', 'roofing', 'locksmith', 'towing', 'auto_repair', 'veterinary', 'property_management');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "vertical" "Vertical" NOT NULL DEFAULT 'restaurant';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerId" TEXT;

-- AlterTable
ALTER TABLE "TakeoutOrder" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Customer_accountId_name_idx" ON "Customer"("accountId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_accountId_phone_key" ON "Customer"("accountId", "phone");

-- CreateIndex
CREATE INDEX "Reservation_customerId_idx" ON "Reservation"("customerId");

-- CreateIndex
CREATE INDEX "TakeoutOrder_customerId_idx" ON "TakeoutOrder"("customerId");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakeoutOrder" ADD CONSTRAINT "TakeoutOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

