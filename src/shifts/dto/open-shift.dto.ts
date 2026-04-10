import { IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class OpenShiftDto {
  @IsNotEmpty()
  @IsString()
  branchId!: string;

  @IsNotEmpty()
  @IsString()
  terminalId!: string;

  @IsNotEmpty()
  @IsString()
  cashierId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  openingCash!: number;
}
