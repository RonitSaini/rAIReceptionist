-- Dispatch-first: locksmith and towing.
--
-- Additive only. Five nullable-or-defaulted columns on Account; nothing altered, nothing dropped.
-- Every existing account keeps its behaviour: takesScheduledWork defaults true, and the two null
-- override columns fall back to what the code already did (a 10-minute acknowledgement window and
-- the vertical's own follow-up copy).
ALTER TABLE "Account" ADD COLUMN "takesScheduledWork" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Account" ADD COLUMN "responseTimeMinMinutes" INTEGER;
ALTER TABLE "Account" ADD COLUMN "responseTimeMaxMinutes" INTEGER;
ALTER TABLE "Account" ADD COLUMN "escalationAckMinutes" INTEGER;
ALTER TABLE "Account" ADD COLUMN "unacknowledgedMessage" TEXT;
