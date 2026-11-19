import { Global, Module } from '@nestjs/common';
import { MedicalHistoryService } from './medical-history.service';
import { PatientAccessService } from './patient-access.service';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';

@Global()
@Module({
  controllers: [PatientsController],
  providers: [PatientsService, MedicalHistoryService, PatientAccessService],
  exports: [PatientAccessService],
})
export class PatientsModule {}
