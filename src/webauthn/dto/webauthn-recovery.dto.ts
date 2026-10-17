import { IsDefined, IsOptional, IsString, Length, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WebAuthnAuthenticatorAssertionResponseJSON } from './webauthn.dto.js';

export class GenerateRecoveryCodesDto {
  @IsOptional()
  @IsString()
  @Length(0, 64)
  password?: string;
}

export class LoginWithRecoveryCodeDto {
  @IsString()
  @Length(3, 64)
  username!: string;

  @IsString()
  @Length(6, 32)
  code!: string;
}

export class StepUpStartDto {
  /** Optional reason for the audit log (e.g. "refund", "role-change") */
  @IsOptional()
  @IsString()
  @Length(2, 64)
  reason?: string;
}

export class StepUpFinishDto {
  @IsString()
  @Length(8, 1024)
  id!: string;

  @IsString()
  @Length(8, 1024)
  rawId!: string;

  @IsString()
  type!: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => WebAuthnAuthenticatorAssertionResponseJSON)
  response!: WebAuthnAuthenticatorAssertionResponseJSON;

  /** Opaque reason string for the audit log (e.g. "refund", "role-change") */
  @IsString()
  @Length(2, 64)
  reason!: string;
}
