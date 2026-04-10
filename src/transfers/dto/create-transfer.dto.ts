import {
  IsNotEmpty,
  IsString,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';

/**
 * DTO for creating a transfer request
 * Requirements: 4.1
 * Property 15: Transfer structure completeness
 */
export class CreateTransferDto {
  @IsNotEmpty()
  @IsString()
  sourceBranchId!: string;

  @IsNotEmpty()
  @IsString()
  destinationBranchId!: string;

  @IsNotEmpty()
  @IsString()
  productId!: string;

  @IsNotEmpty()
  @IsString()
  batchId!: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
