import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { enquiryRequestSchema, type EnquiryRequest, type EnquiryResponse } from '@dpms/contracts';
import { Public } from '../auth/decorators';
import type { AppRequest } from '../auth/auth.types';
import { toOpenApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EnquiriesService } from './enquiries.service';

/** The only unauthenticated write endpoint besides sign-in. Rate-limited per client (see AppModule). */
@ApiTags('enquiries')
@Controller('enquiries')
export class EnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Public()
  @Post()
  @HttpCode(202)
  @ApiOperation({ summary: 'Send an enquiry to the operator (public, rate limited)' })
  @ApiBody({ schema: toOpenApi(enquiryRequestSchema) })
  submit(
    @Body(new ZodValidationPipe(enquiryRequestSchema)) body: EnquiryRequest,
    @Req() req: AppRequest,
  ): Promise<EnquiryResponse> {
    return this.enquiries.submit(body, { requestId: req.id, ip: req.ip });
  }
}
