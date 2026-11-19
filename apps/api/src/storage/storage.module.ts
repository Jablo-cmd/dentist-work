import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import { S3Storage } from './s3-storage';
import { UnconfiguredStorage } from './unconfigured-storage';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ENV],
      useFactory: (env: Env): ObjectStorage =>
        env.storage ? new S3Storage(env.storage) : new UnconfiguredStorage(),
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}
