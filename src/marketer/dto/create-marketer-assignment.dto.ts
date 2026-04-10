import { IsInt, IsMongoId, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMarketerAssignmentDto {
  @IsMongoId()
  branchId!: string;

  @IsMongoId()
  marketerId!: string;

  @IsMongoId()
  productId!: string;

  @IsInt()
  @Min(1)
  assignedQuantity!: number;

  @IsNumber()
  @Min(0)
  assignedUnitPrice!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
