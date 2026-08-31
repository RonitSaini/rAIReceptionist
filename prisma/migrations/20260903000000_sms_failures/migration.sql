-- Record the texts we failed to send, and tie them to the job they were about.
--
-- Additive only: two nullable columns and one index. A message that never reached Twilio has no
-- SID, so it is stored under a synthetic `failed:<uuid>` key with numSegments 0 — billing sums
-- segments, so these rows cost nothing and are still there to be read. A message we failed to send
-- is a fact about the account, not an absence.
ALTER TABLE "SmsMessage" ADD COLUMN "error" TEXT;
ALTER TABLE "SmsMessage" ADD COLUMN "jobId" TEXT;
CREATE INDEX "SmsMessage_jobId_idx" ON "SmsMessage"("jobId");
