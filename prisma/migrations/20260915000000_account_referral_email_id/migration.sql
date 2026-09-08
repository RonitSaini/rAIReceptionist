-- Resend's id for the referral follow-up scheduled at sign-up, so deleting the account can cancel
-- a send that has not gone out yet (2026-09-08). Additive and nullable: safe to apply before the
-- build that writes it is live.
ALTER TABLE "Account" ADD COLUMN "referralEmailId" TEXT;
