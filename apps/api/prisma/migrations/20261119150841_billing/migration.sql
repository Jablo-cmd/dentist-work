-- CreateEnum
CREATE TYPE "InvoiceKind" AS ENUM ('INVOICE', 'CREDIT_NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'EFT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECORDED', 'REVERSED');

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "organisationId" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("organisationId","kind")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "kind" "InvoiceKind" NOT NULL DEFAULT 'INVOICE',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "issueDate" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ZAR',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditsInvoiceId" UUID,
    "reason" TEXT,
    "createdByUserId" UUID NOT NULL,
    "postedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMPTZ(6),

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "invoiceId" UUID NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(8,2) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "treatmentItemId" UUID,

    CONSTRAINT "invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organisationId" UUID NOT NULL,
    "practiceId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "receivedOn" DATE NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'RECORDED',
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMPTZ(6),
    "reversedByUserId" UUID,
    "reversalReason" TEXT,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "paymentId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoices_patientId_createdAt_idx" ON "invoices"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "invoices_practiceId_issueDate_idx" ON "invoices"("practiceId", "issueDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_organisationId_number_key" ON "invoices"("organisationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_lines_invoiceId_lineNo_key" ON "invoice_lines"("invoiceId", "lineNo");

-- CreateIndex
CREATE INDEX "payments_patientId_createdAt_idx" ON "payments"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "payments_practiceId_receivedOn_idx" ON "payments"("practiceId", "receivedOn");

-- CreateIndex
CREATE UNIQUE INDEX "payments_organisationId_idempotencyKey_key" ON "payments"("organisationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "payment_allocations_paymentId_idx" ON "payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "payment_allocations_invoiceId_idx" ON "payment_allocations"("invoiceId");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_creditsInvoiceId_fkey" FOREIGN KEY ("creditsInvoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_practiceId_fkey" FOREIGN KEY ("practiceId") REFERENCES "practices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written additions ------------------------------------------------------------------
-- Value and shape constraints ------------------------------------------------------------------
ALTER TABLE "invoices"
  ADD CONSTRAINT "invoices_amounts_chk" CHECK ("subtotal" >= 0 AND "taxTotal" >= 0 AND "total" >= 0 AND "total" = "subtotal" + "taxTotal"),
  ADD CONSTRAINT "invoices_posted_chk" CHECK ("status" <> 'POSTED' OR ("number" IS NOT NULL AND "issueDate" IS NOT NULL AND "postedAt" IS NOT NULL AND "total" > 0)),
  ADD CONSTRAINT "invoices_credit_link_chk" CHECK (("kind" = 'CREDIT_NOTE' AND "creditsInvoiceId" IS NOT NULL AND "reason" IS NOT NULL) OR ("kind" = 'INVOICE' AND "creditsInvoiceId" IS NULL)),
  ADD CONSTRAINT "invoices_currency_chk" CHECK ("currency" = 'ZAR');
ALTER TABLE "invoice_lines"
  ADD CONSTRAINT "invoice_lines_values_chk" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "taxAmount" >= 0 AND "lineTotal" >= 0);
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_amount_chk" CHECK ("amount" > 0),
  ADD CONSTRAINT "payments_reversal_chk" CHECK (("status" = 'REVERSED') = ("reversedAt" IS NOT NULL));
ALTER TABLE "payment_allocations"
  ADD CONSTRAINT "payment_allocations_amount_chk" CHECK ("amount" > 0);

-- Invoices: never deleted; once posted or cancelled they cannot change at all -----------------
CREATE FUNCTION "invoices_guard"() RETURNS trigger AS $$
DECLARE orig RECORD; credited NUMERIC;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoices cannot be deleted' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'posted or cancelled invoices are immutable; issue a credit note instead' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  -- Draft -> posted credit note: it may not credit more than the invoice total (race-safe via row lock).
  IF NEW."status" = 'POSTED' AND NEW."kind" = 'CREDIT_NOTE' THEN
    SELECT * INTO orig FROM "invoices" WHERE "id" = NEW."creditsInvoiceId" FOR UPDATE;
    IF orig."kind" <> 'INVOICE' OR orig."status" <> 'POSTED' OR orig."patientId" <> NEW."patientId" OR orig."practiceId" <> NEW."practiceId" THEN
      RAISE EXCEPTION 'a credit note must reference a posted invoice of the same patient and practice' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    SELECT COALESCE(SUM("total"), 0) INTO credited FROM "invoices"
      WHERE "creditsInvoiceId" = orig."id" AND "kind" = 'CREDIT_NOTE' AND "status" = 'POSTED';
    IF credited + NEW."total" > orig."total" THEN
      RAISE EXCEPTION 'credit notes cannot exceed the invoice total' USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoices_immutability" BEFORE UPDATE OR DELETE ON "invoices"
  FOR EACH ROW EXECUTE FUNCTION "invoices_guard"();

-- Invoice lines may only change while the parent invoice is a draft ---------------------------
CREATE FUNCTION "invoice_lines_guard"() RETURNS trigger AS $$
DECLARE parent_status "InvoiceStatus"; parent_id UUID;
BEGIN
  parent_id := CASE WHEN TG_OP = 'INSERT' THEN NEW."invoiceId" ELSE OLD."invoiceId" END;
  SELECT "status" INTO parent_status FROM "invoices" WHERE "id" = parent_id;
  IF parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'lines of a posted or cancelled invoice are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "invoice_lines_immutability" BEFORE INSERT OR UPDATE OR DELETE ON "invoice_lines"
  FOR EACH ROW EXECUTE FUNCTION "invoice_lines_guard"();

-- Payments: never deleted; identity and amount fixed; only RECORDED -> REVERSED ----------------
CREATE FUNCTION "payments_guard"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'payments cannot be deleted; reverse them instead' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF OLD."status" = 'REVERSED' THEN
    RAISE EXCEPTION 'a reversed payment is immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF NEW."amount" <> OLD."amount" OR NEW."method" <> OLD."method" OR NEW."patientId" <> OLD."patientId"
     OR NEW."practiceId" <> OLD."practiceId" OR NEW."receivedOn" <> OLD."receivedOn"
     OR NEW."idempotencyKey" <> OLD."idempotencyKey" OR NEW."requestHash" <> OLD."requestHash"
     OR NEW."reference" IS DISTINCT FROM OLD."reference" OR NEW."createdByUserId" <> OLD."createdByUserId" THEN
    RAISE EXCEPTION 'posted payment details are immutable' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "payments_immutability" BEFORE UPDATE OR DELETE ON "payments"
  FOR EACH ROW EXECUTE FUNCTION "payments_guard"();

-- Allocations: append-only, and can never over-allocate a payment or an invoice (race-safe) ----
CREATE FUNCTION "payment_allocations_guard"() RETURNS trigger AS $$
DECLARE pay RECORD; inv RECORD; allocated_pay NUMERIC; allocated_inv NUMERIC; credited NUMERIC;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payment_allocations is append-only (% blocked)', TG_OP USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT * INTO pay FROM "payments" WHERE "id" = NEW."paymentId" FOR UPDATE;
  SELECT * INTO inv FROM "invoices" WHERE "id" = NEW."invoiceId" FOR UPDATE;
  IF pay."status" <> 'RECORDED' THEN
    RAISE EXCEPTION 'cannot allocate a reversed payment' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF inv."kind" <> 'INVOICE' OR inv."status" <> 'POSTED' OR inv."patientId" <> pay."patientId" OR inv."practiceId" <> pay."practiceId" THEN
    RAISE EXCEPTION 'payments can only be allocated to posted invoices of the same patient and practice' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT COALESCE(SUM("amount"), 0) INTO allocated_pay FROM "payment_allocations" WHERE "paymentId" = pay."id";
  IF allocated_pay + NEW."amount" > pay."amount" THEN
    RAISE EXCEPTION 'allocations exceed the payment amount' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  SELECT COALESCE(SUM(a."amount"), 0) INTO allocated_inv FROM "payment_allocations" a
    JOIN "payments" p ON p."id" = a."paymentId" WHERE a."invoiceId" = inv."id" AND p."status" = 'RECORDED';
  SELECT COALESCE(SUM("total"), 0) INTO credited FROM "invoices"
    WHERE "creditsInvoiceId" = inv."id" AND "kind" = 'CREDIT_NOTE' AND "status" = 'POSTED';
  IF allocated_inv + credited + NEW."amount" > inv."total" THEN
    RAISE EXCEPTION 'allocation exceeds the outstanding balance of the invoice' USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "payment_allocations_guard_trg" BEFORE INSERT OR UPDATE OR DELETE ON "payment_allocations"
  FOR EACH ROW EXECUTE FUNCTION "payment_allocations_guard"();
