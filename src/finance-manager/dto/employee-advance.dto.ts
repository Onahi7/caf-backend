import {
  IsEnum, IsMongoId, IsNumber, IsOptional, IsString, IsDateString, Min, MaxLength, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdvanceType, RepaymentType } from '../schema/employee-advance.schema.js';

export class AdvanceItemDto {
  @IsMongoId()
  productId!: string;

  @IsMongoId()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateEmployeeAdvanceDto {
  @IsString()
  @MaxLength(100)
  referenceNumber!: string;

  @IsMongoId()
  employeeId!: string;

  @IsMongoId()
  branchId!: string;

  @IsEnum(AdvanceType)
  type!: AdvanceType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdvanceItemDto)
  @IsOptional()
  items?: AdvanceItemDto[];

  @IsNumber()
  @Min(0.01)
  totalAmount!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  totalCost?: number;

  @IsDateString()
  advanceDate!: string;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  notes?: string;

  @IsMongoId()
  @IsOptional()
  coSignedBy?: string;
}

export class RecordAdvanceRepaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(RepaymentType)
  type!: RepaymentType;

  @IsDateString()
  repaymentDate!: string;

  @IsMongoId()
  @IsOptional()
  salaryId?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class WriteOffAdvanceDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class GoodsReturnItemDto {
  @IsMongoId()
  productId!: string;

  @IsMongoId()
  @IsOptional()
  batchId?: string;

  @IsNumber()
  @Min(0.01)
  quantity!: number;
}

export class GoodsReturnAdvanceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GoodsReturnItemDto)
  items!: GoodsReturnItemDto[];

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class AdvanceFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
