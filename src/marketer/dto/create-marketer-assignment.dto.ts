import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMarketerAssignmentItemDto {
  @IsMongoId()
  productId!: string;

  @IsInt()
  @Min(1)
  assignedQuantity!: number;

  @IsNumber()
  @Min(0)
  assignedUnitPrice!: number;
}

export class CreateMarketerAssignmentDto {
  @IsMongoId()
  branchId!: string;

  @IsMongoId()
  marketerId!: string;

  @IsOptional()
  @IsMongoId()
  productId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  assignedQuantity?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  assignedUnitPrice?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateMarketerAssignmentItemDto)
  items?: CreateMarketerAssignmentItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
