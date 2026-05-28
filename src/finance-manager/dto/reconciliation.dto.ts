import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ReconciliationSource, ReconciliationStatus } from '../schema/reconciliation.schema.js';

export class ReconciliationItemDto {
  @IsString()
  description!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsString()
  @IsOptional()
  reference?: string;
}

export class CreateReconciliationDto {
  @IsEnum(ReconciliationSource)
  source!: ReconciliationSource;

  @IsMongoId()
  branchId!: string;

  @IsString()
  period!: string;

  @IsNumber()
  @Min(0)
  totalSales!: number;

  @IsNumber()
  @Min(0)
  totalExpenses!: number;

  @IsNumber()
  expectedCash!: number;

  @IsNumber()
  @Min(0)
  actualCash!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconciliationItemDto)
  @IsOptional()
  items?: ReconciliationItemDto[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class ReviewReconciliationDto {
  @IsEnum(ReconciliationStatus)
  status!: ReconciliationStatus;

  @IsString()
  @IsOptional()
  reviewNotes?: string;
}

export class ReconciliationFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsEnum(ReconciliationSource)
  @IsOptional()
  source?: ReconciliationSource;

  @IsString()
  @IsOptional()
  period?: string;

  @IsEnum(ReconciliationStatus)
  @IsOptional()
  status?: ReconciliationStatus;
}
