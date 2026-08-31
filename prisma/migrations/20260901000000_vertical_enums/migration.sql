-- Field-service values for two enums that were written when this was only restaurants.
--
-- Additive only: ADD VALUE never rewrites a row and never invalidates an existing value, so every
-- restaurant row keeps the meaning it has. Until now a plumber's booking was stored as a
-- `reservation` notification and told apart by its jobId, and the UI had to paper over the label.
--
-- Split from the backfill on purpose. Postgres will accept ALTER TYPE ... ADD VALUE inside a
-- transaction, but the new value cannot be USED until that transaction commits, and Prisma wraps a
-- migration in one. The UPDATE therefore lives in the next migration.

-- What a notification is about.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'job';

-- What a finished call was mainly about.
--   service_call - a visit was booked
--   emergency    - an emergency was dispatched; distinct from `escalation`, which is "a human is
--                  needed", not "someone is in trouble right now"
--   estimate     - a quote visit was booked, which for a roofer is most of the day
ALTER TYPE "CallClassification" ADD VALUE IF NOT EXISTS 'service_call';
ALTER TYPE "CallClassification" ADD VALUE IF NOT EXISTS 'emergency';
ALTER TYPE "CallClassification" ADD VALUE IF NOT EXISTS 'estimate';
