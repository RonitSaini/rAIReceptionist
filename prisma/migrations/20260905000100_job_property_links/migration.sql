-- Foreign keys for the propertyId and unitId Job has carried since Phase 2a.
--
-- Additive: two constraints and two indexes, no column added, altered or dropped. ON DELETE SET
-- NULL rather than CASCADE on purpose — deleting a building must not erase the record of what was
-- ever wrong with it.
CREATE INDEX "Job_propertyId_idx" ON "Job"("propertyId");
CREATE INDEX "Job_unitId_idx" ON "Job"("unitId");
ALTER TABLE "Job" ADD CONSTRAINT "Job_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Job" ADD CONSTRAINT "Job_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
