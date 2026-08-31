-- The SMS costing log, authored from prisma/schema.prisma as it stands.
--
-- SMS is billed per SEGMENT, and Twilio reports the count it actually charged for; this table
-- stores that number rather than re-deriving it from the templates later. Additive only, and it
-- lands after the vertical migration so the two can be applied in order on any database.

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "messageSid" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "toNumber" TEXT NOT NULL,
    "fromNumber" TEXT,
    "numSegments" INTEGER NOT NULL,
    "encoding" TEXT,
    "status" TEXT,
    "purpose" TEXT,
    "callId" TEXT,
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SmsMessage_messageSid_key" ON "SmsMessage"("messageSid");

-- CreateIndex
CREATE INDEX "SmsMessage_accountId_createdAt_idx" ON "SmsMessage"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsMessage_messageSid_idx" ON "SmsMessage"("messageSid");

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
