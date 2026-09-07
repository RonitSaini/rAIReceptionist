-- Billing enforcement (docs/frontdesk-billing-spec.md): grace, billing-paused mode, number
-- reclamation, and the internal-account exemption. Plus the A2P sender-pool marker.
--
-- Additive only, every column nullable or defaulted, no backfill. Safe to apply to production
-- BEFORE the code that reads it ships: the running build never selects these columns.
--
-- Nothing is backfilled on purpose. `paymentFailedAt` / `subscriptionEndedAt` are clocks that
-- start from a Stripe event this app witnesses; inventing a start date for an account that lapsed
-- before this existed would start a reclamation countdown nobody was warned about.

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentFailedAt" TIMESTAMP(3),
ADD COLUMN     "billingPausedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionEndedAt" TIMESTAMP(3),
ADD COLUMN     "reclamationWarnedAt" TIMESTAMP(3),
ADD COLUMN     "numberReleasedAt" TIMESTAMP(3),
ADD COLUMN     "smsPoolAttachedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Call" ADD COLUMN     "billingPausedNotifiedAt" TIMESTAMP(3);
