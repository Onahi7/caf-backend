import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class BiometricRegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  deviceId!: string;
}
