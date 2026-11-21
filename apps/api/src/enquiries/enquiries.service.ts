import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { EnquiryRequest, EnquiryResponse } from '@dpms/contracts';
import { AuditService } from '../audit/audit.service';
import { CodedHttpException } from '../common/http-exception.filter';
import { ENQUIRY_MAILER, type EnquiryMailer } from './enquiry-mailer';

@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);
  constructor(
    @Inject(ENQUIRY_MAILER) private readonly mailer: EnquiryMailer,
    private readonly audit: AuditService,
  ) {}

  async submit(
    input: EnquiryRequest,
    ctx: { requestId: string; ip?: string },
  ): Promise<EnquiryResponse> {
    // Honeypot: bots fill hidden fields. Pretend success so they learn nothing; send nothing; record the fact.
    if (input.website && input.website.trim() !== '') {
      await this.audit.recordBestEffort({
        action: 'enquiry.dropped',
        outcome: 'DENIED',
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
        metadata: { reason: 'honeypot' },
      });
      return { received: true };
    }
    if (!this.mailer.configured)
      throw new CodedHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Enquiries cannot be sent right now. Please email the address shown instead.',
      );
    const { website: _bot, ...enquiry } = input;
    try {
      await this.mailer.send(enquiry, { requestId: ctx.requestId });
    } catch (err) {
      // Never log the visitor's content or the SMTP error text (may echo credentials/addresses).
      this.logger.error({
        msg: 'enquiry delivery failed',
        requestId: ctx.requestId,
        errName: err instanceof Error ? err.name : 'unknown',
      });
      await this.audit.recordBestEffort({
        action: 'enquiry.submit',
        outcome: 'FAILURE',
        requestId: ctx.requestId,
        ipAddress: ctx.ip,
      });
      throw new CodedHttpException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'SERVICE_UNAVAILABLE',
        'Your enquiry could not be sent. Please email the address shown instead.',
      );
    }
    await this.audit.recordBestEffort({
      action: 'enquiry.submit',
      outcome: 'SUCCESS',
      requestId: ctx.requestId,
      ipAddress: ctx.ip,
      metadata: { hasOrganisation: !!enquiry.organisation },
    });
    return { received: true };
  }
}
