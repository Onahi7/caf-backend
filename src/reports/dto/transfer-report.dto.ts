import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { TransferStatus } from '../../transfers/schemas/transfer.schema.js';

/**
 * Transfer report filter DTO
 * Requirements: 14.3
 * Property 58: Transfer log structure
 */
export class TransferReportDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  sourceBranchId?: string;

  @IsOptional()
  @IsString()
  destinationBranchId?: string;

  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/**
 * Transfer report result interface
 */
export interface TransferReportResult {
  summary: {
    totalTransfers: number;
    pendingTransfers: number;
    approvedTransfers: number;
    rejectedTransfers: number;
    completedTransfers: number;
  };
  transfers: Array<{
    transferId: string;
    sourceBranchId: string;
    sourceBranchName?: string;
    destinationBranchId: string;
    destinationBranchName?: string;
    productId: string;
    productName?: string;
    quantity: number;
    status: TransferStatus;
    requestedBy: string;
    requestedByName?: string;
    approvedBy?: string;
    approvedByName?: string;
    createdAt: Date;
    approvedAt?: Date;
    completedAt?: Date;
    reason: string;
  }>;
}
