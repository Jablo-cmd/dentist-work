-- CreateEnum
CREATE TYPE "ImagingModality" AS ENUM ('XRAY_INTRAORAL', 'XRAY_PANORAMIC', 'XRAY_CEPHALOMETRIC', 'PHOTO', 'DOCUMENT', 'SCAN_3D', 'OTHER');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('NOT_SCANNED');

-- CreateTable
CREATE TABLE "imaging_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "encounterId" UUID,
    "modality" "ImagingModality" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual_upload',
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'NOT_SCANNED',
    "acquiredAt" TIMESTAMPTZ(6),
    "uploadedByUserId" UUID NOT NULL,
    "uploadedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imaging_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "imaging_assets_objectKey_key" ON "imaging_assets"("objectKey");

-- CreateIndex
CREATE INDEX "imaging_assets_patientId_uploadedAt_idx" ON "imaging_assets"("patientId", "uploadedAt");

-- CreateIndex
CREATE UNIQUE INDEX "imaging_assets_patientId_sha256_key" ON "imaging_assets"("patientId", "sha256");

-- AddForeignKey
ALTER TABLE "imaging_assets" ADD CONSTRAINT "imaging_assets_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_assets" ADD CONSTRAINT "imaging_assets_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "imaging_assets" ADD CONSTRAINT "imaging_assets_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions ------------------------------------------------------------------
ALTER TABLE "imaging_assets"
  ADD CONSTRAINT "imaging_assets_size_chk" CHECK ("sizeBytes" > 0),
  ADD CONSTRAINT "imaging_assets_sha256_chk" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "imaging_assets_mime_chk" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'application/pdf', 'application/dicom'));

-- Asset metadata is immutable and cannot be deleted (retention policy pending, Q20).
CREATE FUNCTION "imaging_assets_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'imaging_assets is append-only (% blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "imaging_assets_immutable" BEFORE UPDATE OR DELETE ON "imaging_assets"
  FOR EACH ROW EXECUTE FUNCTION "imaging_assets_block_mutation"();
