import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MfaService } from './mfa.service';
import { PasswordService } from './password.service';
import { SessionPurgeService } from './session-purge.service';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, SessionPurgeService, MfaService],
  exports: [SessionService, PasswordService, MfaService],
})
export class AuthModule {}
