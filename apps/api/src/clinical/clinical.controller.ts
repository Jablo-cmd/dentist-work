import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  addChartEntryRequestSchema,
  addendumRequestSchema,
  amendEncounterRequestSchema,
  changeItemStatusRequestSchema,
  createEncounterRequestSchema,
  createTreatmentPlanRequestSchema,
  saveDraftRequestSchema,
  treatmentItemInputSchema,
  type AddChartEntryRequest,
  type AddendumRequest,
  type AmendEncounterRequest,
  type ChangeItemStatusRequest,
  type ChartEntry,
  type CreateEncounterRequest,
  type CreateTreatmentPlanRequest,
  type Encounter,
  type EncounterSummary,
  type SaveDraftRequest,
  type TreatmentItemInput,
  type TreatmentPlan,
} from '@dpms/contracts';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { toOpenApi } from '../common/openapi';
import { ctxOf } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ChartService } from './chart.service';
import { EncountersService } from './encounters.service';
import { TreatmentPlansService } from './treatment-plans.service';

const uuid = () => new ParseUUIDPipe();
type P = Principal;
type R = AppRequest;

@ApiTags('clinical')
@Controller()
export class ClinicalController {
  constructor(
    private readonly enc: EncountersService,
    private readonly chart: ChartService,
    private readonly plans: TreatmentPlansService,
  ) {}

  // ---- encounters ----------------------------------------------------------------------------
  @Post('patients/:id/encounters')
  @HttpCode(201)
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(createEncounterRequestSchema) })
  createEncounter(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(createEncounterRequestSchema)) b: CreateEncounterRequest,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.create(p, id, b, ctxOf(r));
  }

  @Get('patients/:id/encounters')
  @RequirePermission('clinical_record.read')
  listEncounters(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<EncounterSummary[]> {
    return this.enc.list(p, id, ctxOf(r));
  }

  @Get('encounters/:id')
  @RequirePermission('clinical_record.read')
  getEncounter(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.get(p, id, ctxOf(r));
  }

  @Put('encounters/:id/draft')
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(saveDraftRequestSchema) })
  saveDraft(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(saveDraftRequestSchema)) b: SaveDraftRequest,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.saveDraft(p, id, b, ctxOf(r));
  }

  @Post('encounters/:id/finalise')
  @HttpCode(200)
  @RequirePermission('clinical_record.finalise')
  finalise(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.finalise(p, id, ctxOf(r));
  }

  @Post('encounters/:id/amendments')
  @HttpCode(201)
  @RequirePermission('clinical_record.amend')
  @ApiBody({ schema: toOpenApi(amendEncounterRequestSchema) })
  amend(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(amendEncounterRequestSchema)) b: AmendEncounterRequest,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.amend(p, id, b, ctxOf(r));
  }

  @Post('encounters/:id/addenda')
  @HttpCode(201)
  @RequirePermission('clinical_record.amend')
  @ApiBody({ schema: toOpenApi(addendumRequestSchema) })
  addendum(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addendumRequestSchema)) b: AddendumRequest,
    @Req() r: R,
  ): Promise<Encounter> {
    return this.enc.addendum(p, id, b, ctxOf(r));
  }

  // ---- dental chart ---------------------------------------------------------------------------
  @Get('patients/:id/chart')
  @RequirePermission('clinical_record.read')
  getChart(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<ChartEntry[]> {
    return this.chart.get(p, id, ctxOf(r));
  }

  @Post('patients/:id/chart')
  @HttpCode(201)
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(addChartEntryRequestSchema) })
  addChart(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addChartEntryRequestSchema)) b: AddChartEntryRequest,
    @Req() r: R,
  ): Promise<ChartEntry> {
    return this.chart.add(p, id, b, ctxOf(r));
  }

  @Post('patients/:id/chart/:entryId/resolve')
  @HttpCode(200)
  @RequirePermission('clinical_record.create')
  resolveChart(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Param('entryId', uuid()) entryId: string,
    @Req() r: R,
  ): Promise<ChartEntry> {
    return this.chart.resolve(p, id, entryId, ctxOf(r));
  }

  // ---- treatment plans ------------------------------------------------------------------------
  @Get('patients/:id/treatment-plans')
  @RequirePermission('clinical_record.read')
  listPlans(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Req() r: R,
  ): Promise<TreatmentPlan[]> {
    return this.plans.listForPatient(p, id, ctxOf(r));
  }

  @Post('patients/:id/treatment-plans')
  @HttpCode(201)
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(createTreatmentPlanRequestSchema) })
  createPlan(
    @CurrentPrincipal() p: P,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(createTreatmentPlanRequestSchema)) b: CreateTreatmentPlanRequest,
    @Req() r: R,
  ): Promise<TreatmentPlan> {
    return this.plans.create(p, id, b, ctxOf(r));
  }

  @Get('treatment-plans/:planId')
  @RequirePermission('clinical_record.read')
  getPlan(
    @CurrentPrincipal() p: P,
    @Param('planId', uuid()) id: string,
    @Req() r: R,
  ): Promise<TreatmentPlan> {
    return this.plans.get(p, id, ctxOf(r));
  }

  @Post('treatment-plans/:planId/items')
  @HttpCode(201)
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(treatmentItemInputSchema) })
  addItem(
    @CurrentPrincipal() p: P,
    @Param('planId', uuid()) id: string,
    @Body(new ZodValidationPipe(treatmentItemInputSchema)) b: TreatmentItemInput,
    @Req() r: R,
  ): Promise<TreatmentPlan> {
    return this.plans.addItem(p, id, b, ctxOf(r));
  }

  @Post('treatment-plans/items/:itemId/status')
  @HttpCode(200)
  @RequirePermission('clinical_record.create')
  @ApiBody({ schema: toOpenApi(changeItemStatusRequestSchema) })
  itemStatus(
    @CurrentPrincipal() p: P,
    @Param('itemId', uuid()) id: string,
    @Body(new ZodValidationPipe(changeItemStatusRequestSchema)) b: ChangeItemStatusRequest,
    @Req() r: R,
  ): Promise<TreatmentPlan> {
    return this.plans.changeStatus(p, id, b, ctxOf(r));
  }
}
