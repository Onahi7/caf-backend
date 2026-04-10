import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CloseShiftRequestDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  closingCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalSales?: number;
}
