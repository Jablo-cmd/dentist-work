import { Global, Module } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { ClamdScanner } from './clamd-scanner';
import { MALWARE_SCANNER, type MalwareScanner } from './malware-scanner';
import { UnconfiguredScanner } from './unconfigured-scanner';

@Global()
@Module({
  providers: [
    {
      provide: MALWARE_SCANNER,
      inject: [ENV],
      useFactory: (env: Env): MalwareScanner =>
        env.scanner ? new ClamdScanner(env.scanner) : new UnconfiguredScanner(),
    },
  ],
  exports: [MALWARE_SCANNER],
})
export class ScannerModule {}
