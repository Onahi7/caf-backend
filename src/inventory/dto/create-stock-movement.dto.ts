import {
  IsNotEmpty,
  IsString,
  IsNumber,
  IsMongoId,
  IsEnum,
  IsOptional,
  IsObject,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MovementType } from '../schemas/stock-movement.schema.js';

/**
 * DTO for creating stock movements
 * Requirements: 3.1
 * Property 10: Stock movements are comprehensive
 */
export class CreateStockMovementDto {
  @IsNotEmpty()
  @IsMongoId()
  branchId!: string;

  @IsNotEmpty()
  @IsMongoId()
  productId!: string;

  @IsOptional()
  @IsMongoId()
  batchId?: string;

  @IsNotEmpty()
  @IsNumber()
  quantity!: number;

  @IsNotEmpty()
  @IsEnum(MovementType)
  movementType!: MovementType;

  @IsNotEmpty()
  @IsString()
  reason!: string;

  @IsNotEmpty()
  @IsMongoId()
  userId!: string;

  @IsOptional()
  @IsMongoId()
  referenceId?: string;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  timestamp?: Date;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}
