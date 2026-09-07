-- Email verification (soft gate: a banner until verified, a hard gate only on phone provisioning).
-- One nullable column for the resend cooldown. `emailVerified` already existed and is what Google
-- sign-ins set; nothing is backfilled - an unverified password user stays unverified until they
-- click the link, which is the point.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerificationSentAt" TIMESTAMP(3);
