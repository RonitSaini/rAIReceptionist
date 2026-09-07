-- Contract half of the onboarding step-id change.
--
-- Expand (20260912000000_onboarding_step_ids, applied to production 2026-09-07) added
-- Account.onboardingStepId and mapped every row from this positional Int, per vertical. The build
-- that reads the id shipped the same day (commit 04822ba, production e8smdz0it) and nothing has
-- read this column since; it stayed for exactly one deploy so the running build never met a column
-- it could not select.
--
-- The order for a DROP is the reverse of an ADD. Prisma's client selects every column its schema
-- lists, so this must run only AFTER the build whose schema no longer lists the column is live -
-- dropping it under the previous build would have failed every Account query. Verified before
-- applying: the live build's schema lacks the column, and the fingerprint moves by exactly -1.
--
-- Destructive, so:  npm run db:migrate:prod -- --confirm production --allow-destructive

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "onboardingStep";
