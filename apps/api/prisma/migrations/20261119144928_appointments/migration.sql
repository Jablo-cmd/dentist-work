-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CHECKED_IN', 'COMPLETED', 'CANCELLED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "AppointmentEventType" AS ENUM ('CREATED', 'RESCHEDULED', 'CANCELLED', 'CHECKED_IN', 'COMPLETED', 'NO_SHOW');

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "practitionerUserId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "reason" TEXT,
    "cancelReason" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointmentId" UUID NOT NULL,
    "type" "AppointmentEventType" NOT NULL,
    "actorUserId" UUID,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromStartsAt" TIMESTAMPTZ(6),
    "fromEndsAt" TIMESTAMPTZ(6),
    "toStartsAt" TIMESTAMPTZ(6),
    "toEndsAt" TIMESTAMPTZ(6),
    "reason" TEXT,

    CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointments_practiceId_startsAt_idx" ON "appointments"("practiceId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_practitionerUserId_startsAt_idx" ON "appointments"("practitionerUserId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_patientId_startsAt_idx" ON "appointments"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "appointment_events_appointmentId_occurredAt_idx" ON "appointment_events"("appointmentId", "occurredAt");

-- AddForeignKey
ALTER TABLE "appointment_events" ADD CONSTRAINT "appointment_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions ------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_organisation_fk" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "appointments_practice_fk" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "appointments_patient_fk" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "appointments_practitioner_fk" FOREIGN KEY ("practitionerUserId") REFERENCES "users"("id") ON DELETE RESTRICT,
  ADD CONSTRAINT "appointments_time_order_chk" CHECK ("endsAt" > "startsAt" AND "endsAt" - "startsAt" <= INTERVAL '12 hours');

-- Double-booking is impossible at the database level, even under concurrent requests.
-- Only live appointments (scheduled / checked in) occupy time.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_practitioner_no_overlap"
    EXCLUDE USING gist ("practitionerUserId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
    WHERE ("status" IN ('SCHEDULED', 'CHECKED_IN')),
  ADD CONSTRAINT "appointments_patient_no_overlap"
    EXCLUDE USING gist ("patientId" WITH =, tstzrange("startsAt", "endsAt") WITH &&)
    WHERE ("status" IN ('SCHEDULED', 'CHECKED_IN'));

ALTER TABLE "appointment_events"
  ADD CONSTRAINT "appointment_events_actor_fk" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT;

-- Appointment history is append-only.
CREATE FUNCTION "appointment_events_block_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'appointment_events is append-only (% blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "appointment_events_no_update_delete" BEFORE UPDATE OR DELETE ON "appointment_events"
  FOR EACH ROW EXECUTE FUNCTION "appointment_events_block_mutation"();
