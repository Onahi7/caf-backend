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
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../schemas/sale.schema.js';

/**
 * DTO for individual sale items
 */
export class SaleItemDto {
  @IsMongoId()
  productId!: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;
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
  @MaxLength(500)
  notes?: string;
}
