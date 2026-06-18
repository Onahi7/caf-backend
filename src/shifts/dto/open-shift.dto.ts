import { IsMongoId, IsNotEmpty, IsString, IsNumber, Min } from 'class-validator';

export class OpenShiftDto {
  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

  @IsNotEmpty()
  @IsString()
  terminalId!: string;

  @IsNotEmpty()
  @IsMongoId()
  cashierId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  openingCash!: number;
}
