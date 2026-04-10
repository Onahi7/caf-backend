import { IsOptional, IsString, IsEnum, IsDateString } from 'class-validator';
import { TransferStatus, TransferType } from '../schemas/transfer.schema.js';

/**
 * DTO for filtering transfers
 * Requirements: 10.4
 */
export class TransferFilterDto {
  @IsOptional()
  @IsString()
  sourceBranchId?: string;

  @IsOptional()
  @IsString()
  destinationBranchId?: string;

  @IsOptional()
  @IsString()
  branchId?: string; // Either source or destination

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsEnum(TransferType)
  transferType?: TransferType;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
