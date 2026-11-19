import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { NotFoundException } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { StorageConfig } from '../config/env';
import type { ObjectStorage, StoredObject } from './object-storage';

/** S3-compatible adapter (AWS S3, MinIO, Backblaze, etc.). Buckets must be private; see docs/12. */
export class S3Storage implements ObjectStorage {
  readonly configured = true;
  private readonly client: S3Client;
  constructor(private readonly cfg: StorageConfig) {
    this.client = new S3Client({
      region: cfg.region,
      endpoint: cfg.endpoint,
      forcePathStyle: cfg.forcePathStyle,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
      maxAttempts: 3,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ServerSideEncryption: undefined, // provider-managed encryption at rest is a bucket setting (docs/12)
      }),
    );
  }

  async get(key: string): Promise<StoredObject> {
    try {
      const out = await this.client.send(
        new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      );
      if (!out.Body) throw new NotFoundException();
      return { stream: out.Body as Readable, sizeBytes: Number(out.ContentLength ?? 0) };
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey') throw new NotFoundException();
      throw e;
    }
  }

  async remove(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  async check(): Promise<'up' | 'down'> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.cfg.bucket }), {
        abortSignal: AbortSignal.timeout(2000),
      });
      return 'up';
    } catch {
      return 'down';
    }
  }
}
