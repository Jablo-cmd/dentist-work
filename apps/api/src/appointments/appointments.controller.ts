import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import {
  appointmentTransitionRequestSchema,
  appointmentsQuerySchema,
  cancelAppointmentRequestSchema,
  createAppointmentRequestSchema,
  practitionersQuerySchema,
  rescheduleAppointmentRequestSchema,
  type Appointment,
  type AppointmentEvent,
  type AppointmentTransitionRequest,
  type AppointmentsQuery,
  type CancelAppointmentRequest,
  type CreateAppointmentRequest,
  type Practitioner,
  type RescheduleAppointmentRequest,
} from '@dpms/contracts';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { toOpenApi } from '../common/openapi';
import { ctxOf } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { AppointmentsService } from './appointments.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('appointments')
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appts: AppointmentsService) {}

  @Get()
  @RequirePermission('appointment.read')
  list(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(appointmentsQuerySchema)) q: AppointmentsQuery,
  ): Promise<Appointment[]> {
    return this.appts.list(p, q);
  }

  @Get('practitioners')
  @RequirePermission('appointment.read')
  practitioners(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(practitionersQuerySchema)) q: { practiceId: string },
  ): Promise<Practitioner[]> {
    return this.appts.practitioners(p, q.practiceId);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('appointment.manage')
  @ApiBody({ schema: toOpenApi(createAppointmentRequestSchema) })
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createAppointmentRequestSchema)) b: CreateAppointmentRequest,
    @Req() req: AppRequest,
  ): Promise<Appointment> {
    return this.appts.create(p, b, ctxOf(req));
  }

  @Get(':id')
  @RequirePermission('appointment.read')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<Appointment> {
    return this.appts.get(p, id, ctxOf(req));
  }

  @Get(':id/history')
  @RequirePermission('appointment.read')
  history(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<AppointmentEvent[]> {
    return this.appts.history(p, id, ctxOf(req));
  }

  @Post(':id/reschedule')
  @HttpCode(200)
  @RequirePermission('appointment.manage')
  @ApiBody({ schema: toOpenApi(rescheduleAppointmentRequestSchema) })
  reschedule(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(rescheduleAppointmentRequestSchema))
    b: RescheduleAppointmentRequest,
    @Req() req: AppRequest,
  ): Promise<Appointment> {
    return this.appts.reschedule(p, id, b, ctxOf(req));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('appointment.manage')
  @ApiBody({ schema: toOpenApi(cancelAppointmentRequestSchema) })
  cancel(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(cancelAppointmentRequestSchema)) b: CancelAppointmentRequest,
    @Req() req: AppRequest,
  ): Promise<Appointment> {
    return this.appts.cancel(p, id, b, ctxOf(req));
  }

  @Post(':id/status')
  @HttpCode(200)
  @RequirePermission('appointment.manage')
  @ApiBody({ schema: toOpenApi(appointmentTransitionRequestSchema) })
  transition(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(appointmentTransitionRequestSchema))
    b: AppointmentTransitionRequest,
    @Req() req: AppRequest,
  ): Promise<Appointment> {
    return this.appts.transition(p, id, b.status, ctxOf(req));
  }
}
