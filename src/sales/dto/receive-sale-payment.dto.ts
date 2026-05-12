import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod } from '../schemas/sale.schema.js';

export class ReceiveSalePaymentDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  paymentReference?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  notes?: string;
}
