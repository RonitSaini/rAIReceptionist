-- Shop appointment: auto repair and veterinary.
--
-- Additive only. Three nullable columns on Account and nothing else: the vehicle and the pet live
-- in Job.details, validated by each vertical's intake schema, so neither profession needs a table
-- of its own. Every existing account is unaffected — the columns are null and nothing reads them
-- unless the vertical asks.
ALTER TABLE "Account" ADD COLUMN "towingPartnerName" TEXT;
ALTER TABLE "Account" ADD COLUMN "towingPartnerPhone" TEXT;
ALTER TABLE "Account" ADD COLUMN "emergencyReferralPhone" TEXT;
