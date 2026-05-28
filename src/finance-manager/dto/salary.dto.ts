import { IsEnum, IsMongoId, IsNumber, IsOptional, IsString, IsDateString, Min } from 'class-validator';
import { SalaryStatus } from '../schema/salary.schema.js';

export class CreateSalaryDto {
  @IsMongoId()
  employeeId!: string;

  @IsMongoId()
  branchId!: string;

  @IsString()
  period!: string;

  @IsNumber()
  @Min(0)
  baseSalary!: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  allowances?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductions?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateSalaryDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  baseSalary?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  allowances?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  deductions?: number;

  @IsString()
  @IsOptional()
  paymentMethod?: string;

  @IsDateString()
  @IsOptional()
  paymentDate?: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class SalaryFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsMongoId()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  period?: string;

  @IsEnum(SalaryStatus)
  @IsOptional()
  status?: SalaryStatus;
}
