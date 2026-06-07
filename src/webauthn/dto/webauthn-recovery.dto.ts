import { IsOptional, IsString, Length } from 'class-validator';

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

  response!: {
    clientDataJSON: string;
    authenticatorData: string;
    signature: string;
    userHandle?: string;
  };

  /** Opaque reason string for the audit log (e.g. "refund", "role-change") */
  @IsString()
  @Length(2, 64)
  reason!: string;
}
