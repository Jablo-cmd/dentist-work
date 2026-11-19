import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ENV, type Env } from '../config/env';
import { ImagingController } from './imaging.controller';
import { ImagingService } from './imaging.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ENV],
      // In-memory buffering is bounded by the size limit; one file and a handful of fields per request.
      useFactory: (env: Env) => ({
        limits: { fileSize: env.imagingMaxBytes, files: 1, fields: 8, fieldSize: 1024 },
      }),
    }),
  ],
  controllers: [ImagingController],
  providers: [ImagingService],
})
export class ImagingModule {}
