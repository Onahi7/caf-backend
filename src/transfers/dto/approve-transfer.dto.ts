import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

/**
 * DTO for approving a transfer
 * Requirements: 4.5
 * Property 18: Transfer approval workflow
 */
export class ApproveTransferDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

/**
 * DTO for rejecting a transfer
 */
export class RejectTransferDto {
  @IsNotEmpty()
  @IsString()
  rejectionReason!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
