import { Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './enquiries.service';
import { ENQUIRY_MAILER, type EnquiryMailer } from './enquiry-mailer';
import { SmtpMailer } from './smtp-mailer';
import { UnconfiguredMailer } from './unconfigured-mailer';

@Module({
  controllers: [EnquiriesController],
  providers: [
    EnquiriesService,
    {
      provide: ENQUIRY_MAILER,
      inject: [ENV],
      useFactory: (env: Env): EnquiryMailer =>
        env.smtp ? new SmtpMailer(env.smtp, env.enquiryTo) : new UnconfiguredMailer(),
    },
  ],
})
export class EnquiriesModule {}
