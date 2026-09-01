-- Raw provider error when the escalation call to the manager failed; diagnostics only. Additive.
ALTER TABLE "Call" ADD COLUMN "managerCallError" TEXT;
