import {
  IsEnum, IsMongoId, IsNumber, IsOptional, IsString, IsDateString, Min, Max, MaxLength, MinLength,
} from 'class-validator';
import { LoanDirection, RepaymentFrequency } from '../schema/loan.schema.js';

export class CreateLoanDto {
  @IsString()
  @MaxLength(100)
  referenceNumber!: string;

  @IsEnum(LoanDirection)
  direction!: LoanDirection;

  @IsMongoId()
  branchId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  counterpartyName!: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  counterpartyContact?: string;

  @IsNumber()
  @Min(0.01)
  principalAmount!: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  interestRatePercent!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsNumber()
  @Min(1)
  termMonths!: number;

  @IsEnum(RepaymentFrequency)
  @IsOptional()
  repaymentFrequency?: RepaymentFrequency;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  purpose?: string;

  @IsString()
  @MaxLength(200)
  @IsOptional()
  collateral?: string;

  @IsMongoId()
  @IsOptional()
  coSignedBy?: string;

  @IsMongoId()
  @IsOptional()
  approvedBy?: string;
}

export class RecordLoanRepaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  notes?: string;
}

export class LoanFilterDto {
  @IsMongoId()
  @IsOptional()
  branchId?: string;

  @IsEnum(LoanDirection)
  @IsOptional()
  direction?: LoanDirection;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  counterpartyName?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsString()
  @IsOptional()
  endDate?: string;
}
