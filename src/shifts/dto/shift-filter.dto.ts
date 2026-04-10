import { IsOptional, IsString, IsEnum, IsNumberString } from 'class-validator';
import { ShiftStatus } from '../schemas/shift.schema.js';

export class ShiftFilterDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;

  @IsOptional()
  @IsEnum(ShiftStatus)
  status?: ShiftStatus;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
