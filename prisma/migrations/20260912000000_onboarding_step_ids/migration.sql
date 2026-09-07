-- Onboarding progress by step ID instead of position (the "expand" half of expand/contract).
--
-- Payment now comes BEFORE phone in every vertical, and this is the last time a reorder needs a
-- data migration: from here the column holds the step's id ("payment", "phone", ...) or "done",
-- and a step is wherever its vertical's list currently puts it.
--
-- The legacy Int column stays for exactly one deploy. The running build reads it; the next build
-- reads this one. Dropping it here would break every Account query on the old build between the
-- migration and the push. The contract migration drops it once the new build is live.
--
-- Mapping, from the PRE-swap lists (the ones these Int values were written against):
--   positions before the last two keep their id;
--   the last two (old phone, old payment) both become "payment" - neither had paid, and payment
--   is now the step in front of them;
--   past the end is "done";
--   anything else (0, 1, or a value no list has) restarts at business-basics, which always renders.
--
-- Generated from src/verticals by scratchpad/gen-step-migration.mjs and checked against it; the
-- CASE is per vertical because the lists differ in length.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "onboardingStepId" TEXT NOT NULL DEFAULT 'business-basics';

UPDATE "Account" SET "onboardingStepId" = CASE
  -- restaurant: 8 steps, done was 9
  WHEN "vertical" = 'restaurant' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" = 4 THEN 'menu-policies'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" = 5 THEN 'reservations'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" = 6 THEN 'voice'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" IN (7, 8) THEN 'payment'
  WHEN "vertical" = 'restaurant' AND "onboardingStep" >= 9 THEN 'done'
  -- plumbing: 9 steps, done was 10
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 5 THEN 'services'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 6 THEN 'emergencies'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" = 7 THEN 'voice'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" IN (8, 9) THEN 'payment'
  WHEN "vertical" = 'plumbing' AND "onboardingStep" >= 10 THEN 'done'
  -- hvac: 9 steps, done was 10
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 5 THEN 'services'
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 6 THEN 'emergencies'
  WHEN "vertical" = 'hvac' AND "onboardingStep" = 7 THEN 'voice'
  WHEN "vertical" = 'hvac' AND "onboardingStep" IN (8, 9) THEN 'payment'
  WHEN "vertical" = 'hvac' AND "onboardingStep" >= 10 THEN 'done'
  -- electrical: 9 steps, done was 10
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 5 THEN 'services'
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 6 THEN 'emergencies'
  WHEN "vertical" = 'electrical' AND "onboardingStep" = 7 THEN 'voice'
  WHEN "vertical" = 'electrical' AND "onboardingStep" IN (8, 9) THEN 'payment'
  WHEN "vertical" = 'electrical' AND "onboardingStep" >= 10 THEN 'done'
  -- roofing: 9 steps, done was 10
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 5 THEN 'services'
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 6 THEN 'emergencies'
  WHEN "vertical" = 'roofing' AND "onboardingStep" = 7 THEN 'voice'
  WHEN "vertical" = 'roofing' AND "onboardingStep" IN (8, 9) THEN 'payment'
  WHEN "vertical" = 'roofing' AND "onboardingStep" >= 10 THEN 'done'
  -- locksmith: 10 steps, done was 11
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 5 THEN 'dispatch'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 6 THEN 'services'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 7 THEN 'emergencies'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" = 8 THEN 'voice'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" IN (9, 10) THEN 'payment'
  WHEN "vertical" = 'locksmith' AND "onboardingStep" >= 11 THEN 'done'
  -- towing: 10 steps, done was 11
  WHEN "vertical" = 'towing' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 4 THEN 'service-area'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 5 THEN 'dispatch'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 6 THEN 'services'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 7 THEN 'emergencies'
  WHEN "vertical" = 'towing' AND "onboardingStep" = 8 THEN 'voice'
  WHEN "vertical" = 'towing' AND "onboardingStep" IN (9, 10) THEN 'payment'
  WHEN "vertical" = 'towing' AND "onboardingStep" >= 11 THEN 'done'
  -- auto_repair: 8 steps, done was 9
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" = 4 THEN 'appointments'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" = 5 THEN 'handoffs'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" = 6 THEN 'voice'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" IN (7, 8) THEN 'payment'
  WHEN "vertical" = 'auto_repair' AND "onboardingStep" >= 9 THEN 'done'
  -- veterinary: 8 steps, done was 9
  WHEN "vertical" = 'veterinary' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" = 4 THEN 'appointments'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" = 5 THEN 'handoffs'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" = 6 THEN 'voice'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" IN (7, 8) THEN 'payment'
  WHEN "vertical" = 'veterinary' AND "onboardingStep" >= 9 THEN 'done'
  -- property_management: 8 steps, done was 9
  WHEN "vertical" = 'property_management' AND "onboardingStep" = 2 THEN 'business-basics'
  WHEN "vertical" = 'property_management' AND "onboardingStep" = 3 THEN 'hours'
  WHEN "vertical" = 'property_management' AND "onboardingStep" = 4 THEN 'portfolio'
  WHEN "vertical" = 'property_management' AND "onboardingStep" = 5 THEN 'maintenance'
  WHEN "vertical" = 'property_management' AND "onboardingStep" = 6 THEN 'voice'
  WHEN "vertical" = 'property_management' AND "onboardingStep" IN (7, 8) THEN 'payment'
  WHEN "vertical" = 'property_management' AND "onboardingStep" >= 9 THEN 'done'
  ELSE 'business-basics'
END;
