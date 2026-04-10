import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class BiometricVerifyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;

  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  biometricToken!: string;
}
