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
  addAssignmentRequestSchema,
  createUserRequestSchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema,
  usersQuerySchema,
  type AddAssignmentRequest,
  type CreateUserRequest,
  type Paginated,
  type PaginationQuery,
  type ResetPasswordRequest,
  type UpdateUserRequest,
  type UserSummary,
} from '@dpms/contracts';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { toOpenApi } from '../common/openapi';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UsersService } from './users.service';

const ctx = (req: AppRequest) => ({ requestId: req.id, ip: req.ip });
const uuid = () => new ParseUUIDPipe();

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('user.read')
  list(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(usersQuerySchema)) q: PaginationQuery,
  ): Promise<Paginated<UserSummary>> {
    return this.users.list(p, q);
  }

  @Post()
  @HttpCode(201)
  @RequirePermission('user.manage')
  @ApiBody({ schema: toOpenApi(createUserRequestSchema) })
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createUserRequestSchema)) b: CreateUserRequest,
    @Req() req: AppRequest,
  ): Promise<UserSummary> {
    return this.users.create(p, b, ctx(req));
  }

  @Patch(':id')
  @RequirePermission('user.manage')
  @ApiBody({ schema: toOpenApi(updateUserRequestSchema) })
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(updateUserRequestSchema)) b: UpdateUserRequest,
    @Req() req: AppRequest,
  ): Promise<UserSummary> {
    return this.users.update(p, id, b, ctx(req));
  }

  @Post(':id/assignments')
  @HttpCode(201)
  @RequirePermission('user.manage')
  @ApiBody({ schema: toOpenApi(addAssignmentRequestSchema) })
  addAssignment(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(addAssignmentRequestSchema)) b: AddAssignmentRequest,
    @Req() req: AppRequest,
  ): Promise<UserSummary> {
    return this.users.addAssignment(p, id, b, ctx(req));
  }

  @Delete(':id/assignments/:assignmentId')
  @RequirePermission('user.manage')
  removeAssignment(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Param('assignmentId', uuid()) aid: string,
    @Req() req: AppRequest,
  ): Promise<UserSummary> {
    return this.users.removeAssignment(p, id, aid, ctx(req));
  }

  @Post(':id/reset-password')
  @HttpCode(204)
  @RequirePermission('user.manage')
  @ApiBody({ schema: toOpenApi(resetPasswordRequestSchema) })
  resetPassword(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) b: ResetPasswordRequest,
    @Req() req: AppRequest,
  ): Promise<void> {
    return this.users.resetPassword(p, id, b, ctx(req));
  }
}
