import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  addAllergyRequestSchema,
  addContactRequestSchema,
  addHistoryEntryRequestSchema,
  createPatientRequestSchema,
  duplicatesQuerySchema,
  linkPracticeRequestSchema,
  patientSearchQuerySchema,
  reviewDuplicateRequestSchema,
  updatePatientRequestSchema,
  type AddAllergyRequest,
  type AddContactRequest,
  type AddHistoryEntryRequest,
  type CreatePatientRequest,
  type CreatePatientResponse,
  type DuplicateFlag,
  type LinkPracticeRequest,
  type MedicalHistory,
  type Paginated,
  type Patient,
  type PatientRevision,
  type PatientSearchQuery,
  type PatientSummary,
  type ReviewDuplicateRequest,
  type UpdatePatientRequest,
} from '@dpms/contracts';
import type { z } from 'zod';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { toOpenApi } from '../common/openapi';
import { ctxOf } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MedicalHistoryService } from './medical-history.service';
import { PatientsService } from './patients.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('patients')
@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly history: MedicalHistoryService,
  ) {}

  @Post()
  @HttpCode(201)
  @RequirePermission('patient.create')
  @ApiBody({ schema: toOpenApi(createPatientRequestSchema) })
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createPatientRequestSchema)) b: CreatePatientRequest,
    @Req() req: AppRequest,
  ): Promise<CreatePatientResponse> {
    return this.patients.create(p, b, ctxOf(req));
  }

  @Get()
  @RequirePermission('patient.read')
  search(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(patientSearchQuerySchema)) q: PatientSearchQuery,
    @Req() req: AppRequest,
  ): Promise<Paginated<PatientSummary>> {
    return this.patients.search(p, q, ctxOf(req));
  }

  @Get('duplicates')
  @RequirePermission('patient.update')
  duplicates(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(duplicatesQuerySchema)) q: z.infer<typeof duplicatesQuerySchema>,
  ): Promise<Paginated<DuplicateFlag>> {
    return this.patients.listFlags(p, q.status, q.page, q.pageSize);
  }

  @Post('duplicates/:flagId/review')
  @HttpCode(204)
  @RequirePermission('patient.update')
  @ApiBody({ schema: toOpenApi(reviewDuplicateRequestSchema) })
  review(
    @CurrentPrincipal() p: Principal,
    @Param('flagId', uuid()) id: string,
    @Body(new ZodValidationPipe(reviewDuplicateRequestSchema)) b: ReviewDuplicateRequest,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.patients.reviewFlag(p, id, b, ctxOf(req));
  }

  @Get(':id')
  @RequirePermission('patient.read')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<Patient> {
    return this.patients.get(p, id, ctxOf(req));
  }

  @Patch(':id')
  @RequirePermission('patient.update')
  @ApiBody({ schema: toOpenApi(updatePatientRequestSchema) })
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(updatePatientRequestSchema)) b: UpdatePatientRequest,
    @Req() req: AppRequest,
  ): Promise<Patient> {
    return this.patients.update(p, id, b, ctxOf(req));
  }

  @Get(':id/revisions')
  @RequirePermission('patient.read')
  revisions(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<PatientRevision[]> {
    return this.patients.revisions(p, id, ctxOf(req));
  }

  @Post(':id/practices')
  @HttpCode(200)
  @RequirePermission('patient.update')
  @ApiBody({ schema: toOpenApi(linkPracticeRequestSchema) })
  link(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(linkPracticeRequestSchema)) b: LinkPracticeRequest,
    @Req() req: AppRequest,
  ): Promise<Patient> {
    return this.patients.linkPractice(p, id, b.practiceId, ctxOf(req));
  }

  @Post(':id/contacts')
  @HttpCode(201)
  @RequirePermission('patient.update')
  @ApiBody({ schema: toOpenApi(addContactRequestSchema) })
  addContact(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addContactRequestSchema)) b: AddContactRequest,
    @Req() req: AppRequest,
  ): Promise<Patient> {
    return this.patients.addContact(p, id, b, ctxOf(req));
  }

  @Delete(':id/contacts/:contactId')
  @RequirePermission('patient.update')
  removeContact(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Param('contactId', uuid()) cid: string,
    @Req() req: AppRequest,
  ): Promise<Patient> {
    return this.patients.removeContact(p, id, cid, ctxOf(req));
  }

  // ---- medical history -----------------------------------------------------------------------
  @Get(':id/medical-history')
  @RequirePermission('medical_history.read')
  getHistory(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<MedicalHistory> {
    return this.history.get(p, id, ctxOf(req));
  }

  @Post(':id/medical-history')
  @HttpCode(201)
  @RequirePermission('medical_history.update')
  @ApiBody({ schema: toOpenApi(addHistoryEntryRequestSchema) })
  addEntry(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addHistoryEntryRequestSchema)) b: AddHistoryEntryRequest,
    @Req() req: AppRequest,
  ): Promise<MedicalHistory> {
    return this.history.addEntry(p, id, b, ctxOf(req));
  }

  @Post(':id/allergies')
  @HttpCode(201)
  @RequirePermission('medical_history.update')
  @ApiBody({ schema: toOpenApi(addAllergyRequestSchema) })
  addAllergy(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addAllergyRequestSchema)) b: AddAllergyRequest,
    @Req() req: AppRequest,
  ): Promise<MedicalHistory> {
    return this.history.addAllergy(p, id, b, ctxOf(req));
  }

  @Post(':id/medical-history/:entryId/resolve')
  @HttpCode(200)
  @RequirePermission('medical_history.update')
  resolveEntry(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Param('entryId', uuid()) eid: string,
    @Req() req: AppRequest,
  ): Promise<MedicalHistory> {
    return this.history.resolve(p, id, 'entry', eid, ctxOf(req));
  }

  @Post(':id/allergies/:allergyId/resolve')
  @HttpCode(200)
  @RequirePermission('medical_history.update')
  resolveAllergy(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Param('allergyId', uuid()) aid: string,
    @Req() req: AppRequest,
  ): Promise<MedicalHistory> {
    return this.history.resolve(p, id, 'allergy', aid, ctxOf(req));
  }
}
