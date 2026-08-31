-- Google Calendar sync for jobs (Phase 6). Additive only.
-- Job.googleEventId already exists: it shipped with the Job table itself (20260831000300_field_service).
ALTER TABLE "Job" ADD COLUMN "googleSyncError" TEXT;
