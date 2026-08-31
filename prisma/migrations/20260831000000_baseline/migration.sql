-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."CallClassification" AS ENUM ('reservation', 'takeout', 'question', 'waitlist', 'message', 'escalation', 'missed', 'other');

-- CreateEnum
CREATE TYPE "public"."NotificationPriority" AS ENUM ('normal', 'urgent');

-- CreateEnum
CREATE TYPE "public"."NotificationType" AS ENUM ('reservation', 'takeout', 'waitlist', 'message', 'escalation', 'missed_call', 'system');

-- CreateEnum
CREATE TYPE "public"."RecordSource" AS ENUM ('ai', 'manual');

-- CreateEnum
CREATE TYPE "public"."ReservationStatus" AS ENUM ('booked', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show');

-- CreateEnum
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('none', 'trialing', 'active', 'past_due', 'cancelled');

-- CreateEnum
CREATE TYPE "public"."TakeoutStatus" AS ENUM ('new', 'confirmed', 'ready', 'picked_up', 'cancelled');

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "ownerName" TEXT,
    "cellPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "cuisineType" TEXT,
    "priceRange" TEXT,
    "twilioNumber" TEXT,
    "twilioNumberSid" TEXT,
    "retellAgentId" TEXT,
    "retellLlmId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" "public"."SubscriptionStatus" NOT NULL DEFAULT 'none',
    "voiceId" TEXT NOT NULL DEFAULT '11labs-Adrian',
    "greeting" TEXT,
    "hostName" TEXT NOT NULL DEFAULT 'Alex',
    "canQuotePrices" BOOLEAN NOT NULL DEFAULT true,
    "largePartyThreshold" INTEGER NOT NULL DEFAULT 8,
    "largePartyDepositFee" DECIMAL(10,2),
    "escalatesToManager" BOOLEAN NOT NULL DEFAULT false,
    "escalationTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tableTurnMinutes" INTEGER NOT NULL DEFAULT 90,
    "reservationIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "maxCoversPerSlot" INTEGER,
    "seatingCapacity" INTEGER,
    "takesTakeoutOrders" BOOLEAN NOT NULL DEFAULT true,
    "offersDelivery" BOOLEAN NOT NULL DEFAULT false,
    "deliveryZip" TEXT,
    "deliveryRadiusMiles" DECIMAL(5,1),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "agentSyncedAt" TIMESTAMP(3),
    "agentSyncError" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "onboardingStep" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "setupFeePaidAt" TIMESTAMP(3),
    "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionCurrentPeriodEnd" TIMESTAMP(3),
    "country" TEXT NOT NULL DEFAULT 'US',

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusinessHours" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "periodName" TEXT NOT NULL,
    "open" TEXT NOT NULL,
    "close" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BusinessHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Call" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "twilioCallSid" TEXT,
    "retellCallId" TEXT,
    "callerPhone" TEXT,
    "callerName" TEXT,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "callStatus" TEXT NOT NULL DEFAULT 'ongoing',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "classification" "public"."CallClassification" NOT NULL DEFAULT 'other',
    "recordingUrl" TEXT,
    "publicLogUrl" TEXT,
    "transcript" TEXT,
    "summary" TEXT,
    "sentiment" TEXT,
    "disconnectionReason" TEXT,
    "messageText" TEXT,
    "escalationReason" TEXT,
    "callbackRequested" BOOLEAN NOT NULL DEFAULT false,
    "reservationId" TEXT,
    "takeoutOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "managerCallSid" TEXT,
    "managerCalledAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),

    CONSTRAINT "Call_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calendarName" TEXT,
    "email" TEXT,
    "lastError" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "scope" TEXT,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManagerAvailability" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "start" TEXT NOT NULL,
    "end" TEXT NOT NULL,

    CONSTRAINT "ManagerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MenuItem" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "price" DECIMAL(10,2),
    "description" TEXT,
    "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notification" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "public"."NotificationType" NOT NULL,
    "priority" "public"."NotificationPriority" NOT NULL DEFAULT 'normal',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "reservationId" TEXT,
    "takeoutOrderId" TEXT,
    "callId" TEXT,
    "readAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "followUpSentAt" TIMESTAMP(3),

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Reservation" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "partySize" INTEGER NOT NULL,
    "seatingPreference" TEXT,
    "specialRequests" TEXT,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "public"."ReservationStatus" NOT NULL DEFAULT 'booked',
    "isWaitlist" BOOLEAN NOT NULL DEFAULT false,
    "source" "public"."RecordSource" NOT NULL DEFAULT 'manual',
    "googleEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "smsConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TakeoutOrder" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "items" TEXT NOT NULL,
    "notes" TEXT,
    "pickupTime" TIMESTAMP(3) NOT NULL,
    "isDelivery" BOOLEAN NOT NULL DEFAULT false,
    "deliveryAddress" TEXT,
    "status" "public"."TakeoutStatus" NOT NULL DEFAULT 'new',
    "source" "public"."RecordSource" NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "smsConfirmedAt" TIMESTAMP(3),

    CONSTRAINT "TakeoutOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "googleId" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "accountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_stripeCustomerId_key" ON "public"."Account"("stripeCustomerId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Account_twilioNumber_key" ON "public"."Account"("twilioNumber" ASC);

-- CreateIndex
CREATE INDEX "BusinessHours_accountId_dayOfWeek_idx" ON "public"."BusinessHours"("accountId" ASC, "dayOfWeek" ASC);

-- CreateIndex
CREATE INDEX "Call_accountId_startedAt_idx" ON "public"."Call"("accountId" ASC, "startedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Call_retellCallId_key" ON "public"."Call"("retellCallId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Call_twilioCallSid_key" ON "public"."Call"("twilioCallSid" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GoogleCalendarConnection_accountId_key" ON "public"."GoogleCalendarConnection"("accountId" ASC);

-- CreateIndex
CREATE INDEX "ManagerAvailability_accountId_dayOfWeek_idx" ON "public"."ManagerAvailability"("accountId" ASC, "dayOfWeek" ASC);

-- CreateIndex
CREATE INDEX "MenuItem_accountId_idx" ON "public"."MenuItem"("accountId" ASC);

-- CreateIndex
CREATE INDEX "Notification_accountId_createdAt_idx" ON "public"."Notification"("accountId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Notification_accountId_readAt_idx" ON "public"."Notification"("accountId" ASC, "readAt" ASC);

-- CreateIndex
CREATE INDEX "Reservation_accountId_startTime_idx" ON "public"."Reservation"("accountId" ASC, "startTime" ASC);

-- CreateIndex
CREATE INDEX "Reservation_accountId_status_idx" ON "public"."Reservation"("accountId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "TakeoutOrder_accountId_pickupTime_idx" ON "public"."TakeoutOrder"("accountId" ASC, "pickupTime" ASC);

-- CreateIndex
CREATE INDEX "TakeoutOrder_accountId_status_idx" ON "public"."TakeoutOrder"("accountId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "User_accountId_idx" ON "public"."User"("accountId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "public"."User"("googleId" ASC);

-- AddForeignKey
ALTER TABLE "public"."BusinessHours" ADD CONSTRAINT "BusinessHours_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Call" ADD CONSTRAINT "Call_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Call" ADD CONSTRAINT "Call_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Call" ADD CONSTRAINT "Call_takeoutOrderId_fkey" FOREIGN KEY ("takeoutOrderId") REFERENCES "public"."TakeoutOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManagerAvailability" ADD CONSTRAINT "ManagerAvailability_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MenuItem" ADD CONSTRAINT "MenuItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_callId_fkey" FOREIGN KEY ("callId") REFERENCES "public"."Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "public"."Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notification" ADD CONSTRAINT "Notification_takeoutOrderId_fkey" FOREIGN KEY ("takeoutOrderId") REFERENCES "public"."TakeoutOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Reservation" ADD CONSTRAINT "Reservation_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TakeoutOrder" ADD CONSTRAINT "TakeoutOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "public"."Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

