import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateMarketerAssignmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  assignedQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  assignedUnitPrice?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
