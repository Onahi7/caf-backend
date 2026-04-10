import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsMongoId,
  IsOptional,
} from 'class-validator';

/**
 * DTO for inventory adjustments
 * Requirements: 11.2, 11.3
 * Property 45: Adjustment validation
 * Property 46: Adjustment audit trail
 */
export class InventoryAdjustmentDto {
  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

  @IsNotEmpty()
  @IsMongoId()
  batchId!: string;

  @IsNotEmpty()
  @IsNumber()
  quantityChange!: number;

  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsOptional()
  @IsMongoId()
  approvedBy?: string;
}

/**
 * Response for inventory adjustment
 */
export interface AdjustmentResult {
  success: boolean;
  movementId: string;
  previousQuantity: number;
  newQuantity: number;
  adjustmentAmount: number;
}
