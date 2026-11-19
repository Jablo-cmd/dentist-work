-- CreateEnum
CREATE TYPE "Sex" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "HistoryCategory" AS ENUM ('CONDITION', 'MEDICATION', 'SURGERY', 'FAMILY', 'OTHER');

-- CreateEnum
CREATE TYPE "AllergySeverity" AS ENUM ('MILD', 'MODERATE', 'SEVERE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DuplicateStatus" AS ENUM ('PENDING', 'DISTINCT_PATIENTS', 'CONFIRMED_DUPLICATE');

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "registeringPracticeId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "preferredName" TEXT,
    "dateOfBirth" DATE NOT NULL,
    "sex" "Sex" NOT NULL DEFAULT 'UNSPECIFIED',
    "idNumber" TEXT,
    "email" TEXT,
    "mobilePhone" TEXT,
    "homePhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "suburb" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_practices" (
    "patientId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "linkedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkedByUserId" UUID,

    CONSTRAINT "patient_practices_pkey" PRIMARY KEY ("patientId","practiceId")
);

-- CreateTable
CREATE TABLE "patient_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "isEmergencyContact" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fields" TEXT[],

    CONSTRAINT "patient_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_history_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "category" "HistoryCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "recordedOn" DATE NOT NULL,
    "isAlert" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedByUserId" UUID,

    CONSTRAINT "medical_history_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientId" UUID NOT NULL,
    "substance" TEXT NOT NULL,
    "reaction" TEXT,
    "severity" "AllergySeverity" NOT NULL,
    "source" TEXT NOT NULL,
    "recordedOn" DATE NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedByUserId" UUID,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_duplicate_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patientAId" UUID NOT NULL,
    "patientBId" UUID NOT NULL,
    "reasons" TEXT[],
    "status" "DuplicateStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(6),

    CONSTRAINT "patient_duplicate_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patients_organisationId_lastName_firstName_idx" ON "patients"("organisationId", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "patients_organisationId_dateOfBirth_idx" ON "patients"("organisationId", "dateOfBirth");

-- CreateIndex
CREATE INDEX "patients_organisationId_mobilePhone_idx" ON "patients"("organisationId", "mobilePhone");

-- CreateIndex
CREATE INDEX "patients_organisationId_idNumber_idx" ON "patients"("organisationId", "idNumber");

-- CreateIndex
CREATE INDEX "patient_practices_practiceId_idx" ON "patient_practices"("practiceId");

-- CreateIndex
CREATE INDEX "patient_contacts_patientId_idx" ON "patient_contacts"("patientId");

-- CreateIndex
CREATE INDEX "patient_revisions_patientId_changedAt_idx" ON "patient_revisions"("patientId", "changedAt");

-- CreateIndex
CREATE INDEX "medical_history_entries_patientId_createdAt_idx" ON "medical_history_entries"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "allergies_patientId_createdAt_idx" ON "allergies"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "patient_duplicate_flags_status_idx" ON "patient_duplicate_flags"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patient_duplicate_flags_patientAId_patientBId_key" ON "patient_duplicate_flags"("patientAId", "patientBId");

-- AddForeignKey
ALTER TABLE "patient_practices" ADD CONSTRAINT "patient_practices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_practices" ADD CONSTRAINT "patient_practices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_contacts" ADD CONSTRAINT "patient_contacts_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_revisions" ADD CONSTRAINT "patient_revisions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_history_entries" ADD CONSTRAINT "medical_history_entries_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_duplicate_flags" ADD CONSTRAINT "patient_duplicate_flags_patientAId_fkey" FOREIGN KEY ("patientAId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_duplicate_flags" ADD CONSTRAINT "patient_duplicate_flags_patientBId_fkey" FOREIGN KEY ("patientBId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions ------------------------------------------------------------------
-- A duplicate pair is stored once, in canonical order.
ALTER TABLE "patient_duplicate_flags"
  ADD CONSTRAINT "patient_duplicate_flags_order_chk" CHECK ("patientAId" < "patientBId");

ALTER TABLE "patients"
  ADD CONSTRAINT "patients_dob_range_chk" CHECK ("dateOfBirth" >= DATE '1900-01-01' AND "dateOfBirth" <= CURRENT_DATE);

-- Clinical history is append-only except for the resolution columns.
CREATE FUNCTION "clinical_history_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '% is append-only (DELETE blocked)', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF (to_jsonb(NEW) - 'resolvedAt' - 'resolvedByUserId') IS DISTINCT FROM (to_jsonb(OLD) - 'resolvedAt' - 'resolvedByUserId') THEN
    RAISE EXCEPTION '% rows are immutable; resolve and re-enter instead', TG_TABLE_NAME USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "medical_history_entries_guard" BEFORE UPDATE OR DELETE ON "medical_history_entries"
  FOR EACH ROW EXECUTE FUNCTION "clinical_history_guard"();
CREATE TRIGGER "allergies_guard" BEFORE UPDATE OR DELETE ON "allergies"
  FOR EACH ROW EXECUTE FUNCTION "clinical_history_guard"();
