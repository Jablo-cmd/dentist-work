import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  uploadImagingFieldsSchema,
  type ImagingAsset,
  type UploadImagingFields,
} from '@dpms/contracts';
import type { AppRequest, Principal } from '../auth/auth.types';
import { CurrentPrincipal, RequirePermission } from '../auth/decorators';
import { ctxOf } from '../common/request-context';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ImagingService, type UploadedFile as File } from './imaging.service';

const uuid = () => new ParseUUIDPipe();

@ApiTags('imaging')
@Controller()
export class ImagingController {
  constructor(private readonly imaging: ImagingService) {}

  @Post('patients/:id/imaging')
  @HttpCode(201)
  @RequirePermission('imaging.upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'practiceId', 'modality'],
      properties: {
        file: { type: 'string', format: 'binary' },
        practiceId: { type: 'string', format: 'uuid' },
        modality: { type: 'string' },
        encounterId: { type: 'string', format: 'uuid' },
        acquiredAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  upload(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @UploadedFile() file: File | undefined,
    @Body(new ZodValidationPipe(uploadImagingFieldsSchema)) fields: UploadImagingFields,
    @Req() req: AppRequest,
  ): Promise<ImagingAsset> {
    return this.imaging.upload(p, id, file, fields, ctxOf(req));
  }

  @Get('patients/:id/imaging')
  @RequirePermission('imaging.view')
  list(
    @CurrentPrincipal() p: Principal,
    @Param('id', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<ImagingAsset[]> {
    return this.imaging.list(p, id, ctxOf(req));
  }

  @Get('imaging/:assetId')
  @RequirePermission('imaging.view')
  get(
    @CurrentPrincipal() p: Principal,
    @Param('assetId', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<ImagingAsset> {
    return this.imaging.get(p, id, ctxOf(req));
  }

  @Get('imaging/:assetId/file')
  @RequirePermission('imaging.view')
  download(
    @CurrentPrincipal() p: Principal,
    @Param('assetId', uuid()) id: string,
    @Req() req: AppRequest,
  ): Promise<StreamableFile> {
    return this.imaging.download(p, id, ctxOf(req));
  }
}
