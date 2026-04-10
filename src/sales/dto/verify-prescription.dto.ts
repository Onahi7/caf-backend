import { IsMongoId, IsEnum, IsOptional, IsString } from 'class-validator';
import { PrescriptionStatus } from '../schemas/sale.schema.js';

/**
 * DTO for verifying a prescription
 * Requirements: 22.4
 * Property 81: Prescription verification status
 */
export class VerifyPrescriptionDto {
  @IsMongoId()
  saleId!: string;

  @IsEnum(PrescriptionStatus)
  status!: PrescriptionStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}
