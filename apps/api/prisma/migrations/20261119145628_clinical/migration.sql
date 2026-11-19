-- CreateEnum
CREATE TYPE "EncounterStatus" AS ENUM ('DRAFT', 'FINALISED');

-- CreateEnum
CREATE TYPE "NoteKind" AS ENUM ('DRAFT', 'AMENDMENT', 'ADDENDUM');

-- CreateEnum
CREATE TYPE "ToothSurface" AS ENUM ('MESIAL', 'DISTAL', 'OCCLUSAL', 'INCISAL', 'BUCCAL_LABIAL', 'LINGUAL_PALATAL');

-- CreateEnum
CREATE TYPE "ToothCondition" AS ENUM ('CARIES', 'FILLING', 'CROWN', 'BRIDGE_PONTIC', 'IMPLANT', 'ROOT_CANAL_TREATED', 'FRACTURE', 'MISSING', 'IMPACTED', 'EROSION_WEAR', 'PERIODONTAL_CONCERN', 'OTHER');

-- CreateEnum
CREATE TYPE "TreatmentItemStatus" AS ENUM ('PROPOSED', 'ACCEPTED', 'DECLINED', 'DEFERRED', 'COMPLETED');

-- CreateTable
CREATE TABLE "clinical_encounters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "practitionerUserId" UUID NOT NULL,
    "appointmentId" UUID,
    "encounteredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "EncounterStatus" NOT NULL DEFAULT 'DRAFT',
    "finalisedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clinical_encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clinical_note_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounterId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "kind" "NoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "reason" TEXT,
    "amendsVersion" INTEGER,
    "authorUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_note_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dental_chart_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "encounterId" UUID,
    "toothNumber" TEXT NOT NULL,
    "surfaces" "ToothSurface"[],
    "condition" "ToothCondition" NOT NULL,
    "note" TEXT,
    "recordedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedByUserId" UUID,

    CONSTRAINT "dental_chart_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treatment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "planId" UUID NOT NULL,
    "toothNumber" TEXT,
    "description" TEXT NOT NULL,
    "estimatedAmount" DECIMAL(12,2),
    "status" "TreatmentItemStatus" NOT NULL DEFAULT 'PROPOSED',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "treatment_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treatment_plan_item_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "itemId" UUID NOT NULL,
    "fromStatus" "TreatmentItemStatus",
    "toStatus" "TreatmentItemStatus" NOT NULL,
    "actorUserId" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "treatment_plan_item_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_encounters_patientId_encounteredAt_idx" ON "clinical_encounters"("patientId", "encounteredAt");

-- CreateIndex
CREATE INDEX "clinical_encounters_practiceId_encounteredAt_idx" ON "clinical_encounters"("practiceId", "encounteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "clinical_note_versions_encounterId_versionNumber_key" ON "clinical_note_versions"("encounterId", "versionNumber");

-- CreateIndex
CREATE INDEX "dental_chart_entries_patientId_toothNumber_idx" ON "dental_chart_entries"("patientId", "toothNumber");

-- CreateIndex
CREATE INDEX "treatment_plans_patientId_createdAt_idx" ON "treatment_plans"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "treatment_plan_items_planId_idx" ON "treatment_plan_items"("planId");

-- CreateIndex
CREATE INDEX "treatment_plan_item_events_itemId_occurredAt_idx" ON "treatment_plan_item_events"("itemId", "occurredAt");

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_encounters" ADD CONSTRAINT "clinical_encounters_practitionerUserId_fkey" FOREIGN KEY ("practitionerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_versions" ADD CONSTRAINT "clinical_note_versions_encounterId_fkey" FOREIGN KEY ("encounterId") REFERENCES "clinical_encounters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_note_versions" ADD CONSTRAINT "clinical_note_versions_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dental_chart_entries" ADD CONSTRAINT "dental_chart_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plans" ADD CONSTRAINT "treatment_plans_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_items" ADD CONSTRAINT "treatment_plan_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "treatment_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment_plan_item_events" ADD CONSTRAINT "treatment_plan_item_events_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "treatment_plan_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions ------------------------------------------------------------------
-- Note versions are immutable: every save, amendment and addendum is a new row.
CREATE FUNCTION "clinical_note_versions_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'clinical_note_versions is append-only (% blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "clinical_note_versions_immutable" BEFORE UPDATE OR DELETE ON "clinical_note_versions"
  FOR EACH ROW EXECUTE FUNCTION "clinical_note_versions_block_mutation"();

-- A finalised encounter accepts no new DRAFT versions; amendments/addenda need a finalised one.
CREATE FUNCTION "clinical_note_versions_lifecycle"() RETURNS trigger AS $$
DECLARE enc_status "EncounterStatus";
BEGIN
  SELECT "status" INTO enc_status FROM "clinical_encounters" WHERE "id" = NEW."encounterId";
  IF NEW."kind" = 'DRAFT' AND enc_status = 'FINALISED' THEN
    RAISE EXCEPTION 'finalised encounters cannot receive draft versions' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."kind" IN ('AMENDMENT', 'ADDENDUM') AND enc_status <> 'FINALISED' THEN
    RAISE EXCEPTION 'amendments and addenda require a finalised encounter' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "clinical_note_versions_lifecycle_chk" BEFORE INSERT ON "clinical_note_versions"
  FOR EACH ROW EXECUTE FUNCTION "clinical_note_versions_lifecycle"();

-- Encounters are never deleted; once finalised they cannot revert to DRAFT or change identity.
CREATE FUNCTION "clinical_encounters_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'clinical_encounters rows cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'FINALISED' AND (NEW."status" <> 'FINALISED' OR NEW."finalisedAt" IS DISTINCT FROM OLD."finalisedAt"
     OR NEW."patientId" <> OLD."patientId" OR NEW."practitionerUserId" <> OLD."practitionerUserId") THEN
    RAISE EXCEPTION 'finalised encounters are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "clinical_encounters_immutability" BEFORE UPDATE OR DELETE ON "clinical_encounters"
  FOR EACH ROW EXECUTE FUNCTION "clinical_encounters_guard"();

-- Chart entries: append-only except resolution (reuses the guard from the patients migration).
CREATE TRIGGER "dental_chart_entries_guard" BEFORE UPDATE OR DELETE ON "dental_chart_entries"
  FOR EACH ROW EXECUTE FUNCTION "clinical_history_guard"();
ALTER TABLE "dental_chart_entries"
  ADD CONSTRAINT "dental_chart_tooth_fdi_chk" CHECK ("toothNumber" ~ '^([1-4][1-8]|[5-8][1-5])$');

ALTER TABLE "treatment_plan_items"
  ADD CONSTRAINT "treatment_items_amount_chk" CHECK ("estimatedAmount" IS NULL OR "estimatedAmount" >= 0);

-- Treatment item status history is append-only.
CREATE FUNCTION "treatment_item_events_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'treatment_plan_item_events is append-only (% blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "treatment_item_events_immutable" BEFORE UPDATE OR DELETE ON "treatment_plan_item_events"
  FOR EACH ROW EXECUTE FUNCTION "treatment_item_events_block_mutation"();
