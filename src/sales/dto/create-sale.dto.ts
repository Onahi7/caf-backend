import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsEnum,
  ValidateNested,
  Min,
  IsMongoId,
  MaxLength,
  IsObject,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod, SaleType } from '../schemas/sale.schema.js';

/**
 * DTO for pack size info in sale items
 * Used for unit conversion (e.g., Box of 100 tablets, Strip of 10 tablets)
 */
export class SaleItemPackSizeDto {
  @IsString()
  @IsOptional()
  code?: string;

  @IsString()
  name!: string; // e.g., "Box", "Strip", "Tablet"

  @IsString()
  unit!: string; // e.g., "box", "strip", "tablet"

  @IsNumber()
  @Min(1)
  quantityPerPack!: number; // e.g., 100 for box, 10 for strip

  @IsString()
  @IsOptional()
  barcode?: string;
}

/**
 * DTO for individual sale items
 */
export class SaleItemDto {
  @IsMongoId()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number; // Quantity in selected pack units

  @IsNumber()
  @Min(0)
  unitPrice!: number; // Price per selected pack unit

  /**
   * Pack size info for unit conversion
   * If not provided, quantity is in base units (e.g., tablets)
   */
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => SaleItemPackSizeDto)
  packSize?: SaleItemPackSizeDto;

  /**
   * Quantity in base units for stock deduction
   * Calculated: quantity * quantityPerPack (or quantity if no pack size)
   */
  @IsNumber()
  @Min(1)
  @IsOptional()
  quantityInBaseUnits?: number;
}

/**
 * DTO for creating a new sale (checkout)
 * Requirements: 6.3, 6.4, 6.5, 2.7, 5.5, 6.1, 6.3
 * Property 7: Payment method validation
 * Property 13: Mobile money reference storage
 * Property 15: Optional mobile money reference
 */
export class CreateSaleDto {
  @IsMongoId()
  branchId!: string;

  @IsMongoId()
  shiftId!: string;

  @IsString()
  terminalId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  discount?: number;

  /**
   * Payment method for the sale
   * Property 7: Payment method validation
   * Requirements: 2.7, 5.5
   * Validates against all supported payment methods including mobile money options
   */
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsEnum(SaleType)
  @IsOptional()
  saleType?: SaleType;

  @IsEnum(PaymentMethod)
  @IsOptional()
  initialPaymentMethod?: PaymentMethod;

  @IsNumber()
  @Min(0)
  @IsOptional()
  amountPaid?: number;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  /**
   * Optional payment reference for mobile money and electronic payments
   * Property 13: Mobile money reference storage
   * Property 15: Optional mobile money reference
   * Requirements: 6.1, 6.3
   * Stores transaction IDs for Orange Money, Africell Money, QMoney, and bank transfers
   */
  @IsString()
  @IsOptional()
  paymentReference?: string;

  @IsString()
  @IsOptional()
  prescriptionUrl?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  customerName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  customerPhone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  patientId?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  patientName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  sourceSystem?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
