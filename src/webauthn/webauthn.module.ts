import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebAuthnController } from './webauthn.controller.js';
import { WebAuthnService } from './webauthn.service.js';
import {
  WebAuthnCredential,
  WebAuthnCredentialSchema,
} from './schemas/webauthn-credential.schema.js';
import {
  WebAuthnChallenge,
  WebAuthnChallengeSchema,
} from './schemas/webauthn-challenge.schema.js';
import {
  WebAuthnRecoveryCode,
  WebAuthnRecoveryCodeSchema,
} from './schemas/webauthn-recovery-code.schema.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebAuthnCredential.name, schema: WebAuthnCredentialSchema },
      { name: WebAuthnChallenge.name, schema: WebAuthnChallengeSchema },
      { name: WebAuthnRecoveryCode.name, schema: WebAuthnRecoveryCodeSchema },
    ]),
    AuthModule,
    UsersModule,
    AuditModule,
  ],
  controllers: [WebAuthnController],
  providers: [WebAuthnService],
  exports: [WebAuthnService],
})
export class WebAuthnModule {}
