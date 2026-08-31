-- Move existing job notifications onto the value that now exists for them.
--
-- Only rows that already carry a jobId are touched: those are exactly the ones that were forced to
-- borrow `reservation` because no better value existed. A restaurant has no such rows, so this
-- changes nothing on a restaurant account.
UPDATE "Notification" SET "type" = 'job' WHERE "jobId" IS NOT NULL AND "type" = 'reservation';

-- Same story for the calls those bookings came in on.
UPDATE "Call" SET "classification" = 'service_call' WHERE "jobId" IS NOT NULL AND "classification" = 'reservation';
