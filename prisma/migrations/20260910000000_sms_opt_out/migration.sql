-- Opt-out state for SMS. Additive only: one nullable column, no backfill.
--
-- NULL is the correct value for every existing row. Nobody's opt-out is being recorded here
-- retroactively -- the carrier has always held the real list, and this column only mirrors what
-- arrives from now on (an inbound STOP/START, or a 21610 on a delivery receipt). A backfill would
-- have to guess, and guessing wrong in the "opted out" direction silently stops a real business
-- from texting a customer who never asked to leave.

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "smsOptedOutAt" TIMESTAMP(3);
