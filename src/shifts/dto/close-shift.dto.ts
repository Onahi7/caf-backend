import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CloseShiftDto {
  @IsNotEmpty()
  @IsString()
  shiftId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  closingCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
