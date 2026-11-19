import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  allocatePaymentRequestSchema,
  createCreditNoteRequestSchema,
  createInvoiceRequestSchema,
  idempotencyKeySchema,
  recordPaymentRequestSchema,
  replaceLinesRequestSchema,
  reportQuerySchema,
  reversePaymentRequestSchema,
  type AllocatePaymentRequest,
  type CreateCreditNoteRequest,
  type CreateInvoiceRequest,
  type FinancialSummary,
  type Invoice,
  type OperationalSummary,
  type PatientAccount,
  type Payment,
  type RecordPaymentRequest,
  type ReplaceLinesRequest,
  type ReportQuery,
  type ReversePaymentRequest,
} from '@dpms/contracts';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { toOpenApi } from '../common/openapi';
import { ctxOf } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { BillingService } from './billing.service';
import { ReportsService } from './reports.service';

const uuid = () => new ParseUUIDPipe();
type P = Principal;
type R = AppRequest;

@ApiTags('billing')
@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('patients/:id/invoices')
  @HttpCode(201)
  @RequirePermission('billing.manage')
  @ApiBody({ schema: toOpenApi(createInvoiceRequestSchema) })
  create(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(createInvoiceRequestSchema)) b: CreateInvoiceRequest,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.createDraft(p, id, b, ctxOf(r));
  }

  @Get('patients/:id/invoices')
  @RequirePermission('billing.read')
  list(@CurrentPrincipal() p: P, @Param('id', uuid()) id: string, @Req() r: R): Promise<Invoice[]> {
    return this.billing.listForPatient(p, id, ctxOf(r));
  }

  @Get('patients/:id/account')
  @RequirePermission('billing.read')
  account(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<PatientAccount> {
    return this.billing.account(p, id, ctxOf(r));
  }

  @Get('invoices/:invoiceId')
  @RequirePermission('billing.read')
  get(
    @CurrentPrincipal() p: P,
    @Param('invoiceId', uuid()) id: string,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.get(p, id, ctxOf(r));
  }

  @Put('invoices/:invoiceId/lines')
  @RequirePermission('billing.manage')
  @ApiBody({ schema: toOpenApi(replaceLinesRequestSchema) })
  lines(
    @CurrentPrincipal() p: P,
    @Param('invoiceId', uuid()) id: string,
    @Body(new ZodValidationPipe(replaceLinesRequestSchema)) b: ReplaceLinesRequest,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.replaceLines(p, id, b.lines, ctxOf(r));
  }

  @Post('invoices/:invoiceId/post')
  @HttpCode(200)
  @RequirePermission('billing.manage')
  post(
    @CurrentPrincipal() p: P,
    @Param('invoiceId', uuid()) id: string,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.post(p, id, ctxOf(r));
  }

  @Post('invoices/:invoiceId/discard')
  @HttpCode(200)
  @RequirePermission('billing.manage')
  discard(
    @CurrentPrincipal() p: P,
    @Param('invoiceId', uuid()) id: string,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.discard(p, id, ctxOf(r));
  }

  @Post('invoices/:invoiceId/credit-notes')
  @HttpCode(201)
  @RequirePermission('billing.manage')
  @ApiBody({ schema: toOpenApi(createCreditNoteRequestSchema) })
  creditNote(
    @CurrentPrincipal() p: P,
    @Param('invoiceId', uuid()) id: string,
    @Body(new ZodValidationPipe(createCreditNoteRequestSchema)) b: CreateCreditNoteRequest,
    @Req() r: R,
  ): Promise<Invoice> {
    return this.billing.createCreditNote(p, id, b, ctxOf(r));
  }

  @Post('patients/:id/payments')
  @RequirePermission('payment.record')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      '16-100 URL-safe characters. Retrying with the same key never creates a second payment.',
  })
  @ApiBody({ schema: toOpenApi(recordPaymentRequestSchema) })
  async record(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body(new ZodValidationPipe(recordPaymentRequestSchema)) b: RecordPaymentRequest,
    @Req() r: R,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Payment> {
    const parsed = idempotencyKeySchema.safeParse(key);
    if (!parsed.success)
      throw new BadRequestException(
        'A valid Idempotency-Key header (16-100 URL-safe characters) is required.',
      );
    const { payment, replayed } = await this.billing.recordPayment(p, id, parsed.data, b, ctxOf(r));
    res.status(replayed ? 200 : 201).setHeader('Idempotent-Replay', String(replayed));
    return payment;
  }

  @Post('payments/:paymentId/allocations')
  @HttpCode(200)
  @RequirePermission('payment.record')
  @ApiBody({ schema: toOpenApi(allocatePaymentRequestSchema) })
  allocate(
    @CurrentPrincipal() p: P,
    @Param('paymentId', uuid()) id: string,
    @Body(new ZodValidationPipe(allocatePaymentRequestSchema)) b: AllocatePaymentRequest,
    @Req() r: R,
  ): Promise<Payment> {
    return this.billing.allocate(p, id, b, ctxOf(r));
  }

  @Post('payments/:paymentId/reverse')
  @HttpCode(200)
  @RequirePermission('payment.record')
  @ApiBody({ schema: toOpenApi(reversePaymentRequestSchema) })
  reverse(
    @CurrentPrincipal() p: P,
    @Param('paymentId', uuid()) id: string,
    @Body(new ZodValidationPipe(reversePaymentRequestSchema)) b: ReversePaymentRequest,
    @Req() r: R,
  ): Promise<Payment> {
    return this.billing.reverse(p, id, b, ctxOf(r));
  }
}

@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('financial-summary')
  @RequirePermission('financial_report.read')
  financial(
    @CurrentPrincipal() p: P,
    @Query(new ZodValidationPipe(reportQuerySchema)) q: ReportQuery,
    @Req() r: R,
  ): Promise<FinancialSummary> {
    return this.reports.financial(p, q, ctxOf(r));
  }

  @Get('operational-summary')
  @RequirePermission('appointment.read')
  operational(
    @CurrentPrincipal() p: P,
    @Query(new ZodValidationPipe(reportQuerySchema)) q: ReportQuery,
    @Req() r: R,
  ): Promise<OperationalSummary> {
    return this.reports.operational(p, q, ctxOf(r));
  }
}
