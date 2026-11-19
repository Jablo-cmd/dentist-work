import { Module } from '@nestjs/common';
import { ChartService } from './chart.service';
import { ClinicalController } from './clinical.controller';
import { EncountersService } from './encounters.service';
import { TreatmentPlansService } from './treatment-plans.service';

@Module({
  controllers: [ClinicalController],
  providers: [EncountersService, ChartService, TreatmentPlansService],
})
export class ClinicalModule {}
