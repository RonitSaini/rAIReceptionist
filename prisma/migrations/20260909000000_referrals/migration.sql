-- Referrals: a code per account, the claims made against it, and the credit ledger. Additive only.
--
-- The two DROP INDEX statements Prisma wanted here (Job_propertyId_idx, Job_unitId_idx) were left
-- out on purpose: those indexes predate this change and are not ours to remove.

-- CreateEnum
CREATE TYPE "ReferralSide" AS ENUM ('referrer', 'referred');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "referralCode" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referrerAccountId" TEXT,
    "referredAccountId" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "qualifiedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCredit" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "side" "ReferralSide" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'usd',
    "appliedAt" TIMESTAMP(3),
    "stripeCouponId" TEXT,
    "stripeCheckoutSessionId" TEXT,
    "stripeBalanceTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredAccountId_key" ON "Referral"("referredAccountId");

-- CreateIndex
CREATE INDEX "Referral_referrerAccountId_idx" ON "Referral"("referrerAccountId");

-- CreateIndex
CREATE INDEX "ReferralCredit_accountId_appliedAt_idx" ON "ReferralCredit"("accountId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCredit_referralId_side_key" ON "ReferralCredit"("referralId", "side");

-- CreateIndex
CREATE UNIQUE INDEX "Account_referralCode_key" ON "Account"("referralCode");

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerAccountId_fkey" FOREIGN KEY ("referrerAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredAccountId_fkey" FOREIGN KEY ("referredAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCredit" ADD CONSTRAINT "ReferralCredit_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "Referral"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every account that existed before this migration gets a code, so nothing anywhere has
-- to generate one lazily during a page render (reads never write). The alphabet matches
-- src/lib/referrals.ts exactly -- no O/0, I/1 or L, because these get read aloud and written down.
-- The inner loop re-rolls on collision against the unique index that now exists, so this cannot
-- fail on an unlucky draw.
DO $$
DECLARE
  account_row RECORD;
  candidate TEXT;
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i INT;
BEGIN
  FOR account_row IN SELECT "id" FROM "Account" WHERE "referralCode" IS NULL LOOP
    LOOP
      candidate := '';
      FOR i IN 1..8 LOOP
        candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM "Account" WHERE "referralCode" = candidate);
    END LOOP;
    UPDATE "Account" SET "referralCode" = candidate WHERE "id" = account_row."id";
  END LOOP;
END $$;
