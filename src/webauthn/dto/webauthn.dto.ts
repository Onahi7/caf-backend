import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class WebAuthnAuthenticatorAttestationResponseJSON {
  @IsString()
  clientDataJSON!: string;

  @IsString()
  attestationObject!: string;

  @IsOptional()
  @IsString({ each: true })
  transports?: string[];
}

export class WebAuthnAuthenticatorAssertionResponseJSON {
  @IsString()
  clientDataJSON!: string;

  @IsString()
  authenticatorData!: string;

  @IsString()
  signature!: string;

  @IsOptional()
  @IsString()
  userHandle?: string;
}

export class WebAuthnRegistrationStartDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceName?: string;
}

export class WebAuthnRegistrationFinishDto {
  @IsString()
  id!: string;

  @IsString()
  rawId!: string;

  @IsString()
  type!: string;

  @ValidateNested()
  @Type(() => WebAuthnAuthenticatorAttestationResponseJSON)
  response!: WebAuthnAuthenticatorAttestationResponseJSON;

  @IsOptional()
  @IsString()
  authenticatorAttachment?: 'platform' | 'cross-platform';

  @IsOptional()
  clientExtensionResults?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceName?: string;
}

export class WebAuthnLoginStartDto {
  @IsOptional()
  @IsString()
  username?: string;
}

export class WebAuthnLoginFinishDto {
  @IsString()
  id!: string;

  @IsString()
  rawId!: string;

  @IsString()
  type!: string;

  @ValidateNested()
  @Type(() => WebAuthnAuthenticatorAssertionResponseJSON)
  response!: WebAuthnAuthenticatorAssertionResponseJSON;

  @IsOptional()
  @IsString()
  username?: string;
}
