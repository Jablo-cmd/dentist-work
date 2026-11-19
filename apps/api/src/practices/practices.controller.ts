import {
  Body,
  Controller,
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
  createPracticeRequestSchema,
  paginationQuerySchema,
  updatePracticeRequestSchema,
  type CreatePracticeRequest,
  type UpdatePracticeRequest,
  type Paginated,
  type PaginationQuery,
  type Practice,
} from '@dpms/contracts';
import { toOpenApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { PracticesService } from './practices.service';

@ApiTags('practices')
@Controller('practices')
export class PracticesController {
  constructor(private readonly practices: PracticesService) {}

  @Get()
  @RequirePermission('practice.read')
  list(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(paginationQuerySchema)) q: PaginationQuery,
  ): Promise<Paginated<Practice>> {
    return this.practices.list(p, q);
  }

  @Get(':id')
  @RequirePermission('practice.read')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AppRequest,
  ): Promise<Practice> {
    return this.practices.get(p, id, req.id, req.ip);
  }

  @Patch(':id')
  @RequirePermission('practice.manage', { orgWide: true })
  @ApiBody({ schema: toOpenApi(updatePracticeRequestSchema) })
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updatePracticeRequestSchema)) body: UpdatePracticeRequest,
    @Req() req: AppRequest,
  ): Promise<Practice> {
    return this.practices.update(p, id, body, req.id, req.ip);
  }

  @Post()
  @HttpCode(201)
  @ApiBody({ schema: toOpenApi(createPracticeRequestSchema) })
  @RequirePermission('practice.manage', { orgWide: true })
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createPracticeRequestSchema)) body: CreatePracticeRequest,
    @Req() req: AppRequest,
  ): Promise<Practice> {
    return this.practices.create(p, body, req.id, req.ip);
  }
}
