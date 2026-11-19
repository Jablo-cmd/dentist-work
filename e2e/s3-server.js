// S3-compatible server for tests only (real AWS SDK adapter is exercised against it).
const { mkdtempSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const S3rver = require('s3rver');
const server = new S3rver({
  port: 4571,
  address: '127.0.0.1',
  silent: true,
  directory: mkdtempSync(join(tmpdir(), 'dpms-e2e-s3-')),
  configureBuckets: [{ name: 'dpms-e2e-private' }],
});
server.run();
process.on('SIGTERM', () => server.close().finally(() => process.exit(0)));
