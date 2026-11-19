import { Module } from '@nestjs/common';
import { BillingController, ReportsController } from './billing.controller';
import { BillingService } from './billing.service';
import { ReportsService } from './reports.service';

@Module({
  controllers: [BillingController, ReportsController],
  providers: [BillingService, ReportsService],
})
export class BillingModule {}
