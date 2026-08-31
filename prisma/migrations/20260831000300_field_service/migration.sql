-- Phase 2a: the field_service archetype.
--
-- Additive only. Job is the booking record for every vertical that is not a restaurant, and
-- ServiceOffering is what a trade sells; Reservation, TakeoutOrder and MenuItem are untouched and
-- keep serving restaurants. The new Account columns are field-service settings, all nullable or
-- defaulted, so existing rows are unaffected.
--
-- Note what is NOT here: no service-area columns. `deliveryZip` and `deliveryRadiusMiles` already
-- express "a postcode and a radius in miles around the business" and are reused rather than
-- duplicated.

-- CreateEnum
CREATE TYPE "JobKind" AS ENUM ('service_call', 'estimate', 'dispatch', 'shop_visit', 'work_order');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('requested', 'scheduled', 'dispatched', 'en_route', 'in_progress', 'completed', 'cancelled');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "calloutFeeMicros" BIGINT,
ADD COLUMN     "emergencyTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "jobSlotMinutes" INTEGER NOT NULL DEFAULT 120,
ADD COLUMN     "maxJobsPerDay" INTEGER,
ADD COLUMN     "technicianName" TEXT;

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "jobId" TEXT;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "jobId" TEXT;

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "customerId" TEXT,
    "kind" "JobKind" NOT NULL DEFAULT 'service_call',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "address" TEXT,
    "description" TEXT,
    "isEmergency" BOOLEAN NOT NULL DEFAULT false,
    "scheduledStart" TIMESTAMP(3),
    "scheduledEnd" TIMESTAMP(3),
    "status" "JobStatus" NOT NULL DEFAULT 'requested',
    "assignedTo" TEXT,
    "source" "RecordSource" NOT NULL DEFAULT 'manual',
    "details" JSONB,
    "propertyId" TEXT,
    "unitId" TEXT,
    "googleEventId" TEXT,
    "smsConfirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceOffering" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priceFromMicros" BIGINT,
    "canQuote" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceOffering_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_accountId_scheduledStart_idx" ON "Job"("accountId", "scheduledStart");

-- CreateIndex
CREATE INDEX "Job_accountId_status_idx" ON "Job"("accountId", "status");

-- CreateIndex
CREATE INDEX "Job_customerPhone_idx" ON "Job"("customerPhone");

-- CreateIndex
CREATE INDEX "Job_customerId_idx" ON "Job"("customerId");

-- CreateIndex
CREATE INDEX "ServiceOffering_accountId_sortOrder_idx" ON "ServiceOffering"("accountId", "sortOrder");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceOffering" ADD CONSTRAINT "ServiceOffering_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Call" ADD CONSTRAINT "Call_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
