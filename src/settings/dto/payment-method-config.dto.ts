import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum PaymentMethodConfigType {
  CASH = 'cash',
  CARD = 'card',
  MOBILE_MONEY = 'mobile_money',
  BANK_TRANSFER = 'bank_transfer',
  OTHER = 'other',
}

export class CreatePaymentMethodConfigDto {
  @IsString()
  name!: string;

  @IsEnum(PaymentMethodConfigType)
  type!: PaymentMethodConfigType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  processingFee?: number;

  @IsOptional()
  @IsString()
  accountDetails?: string;
}

export class UpdatePaymentMethodConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(PaymentMethodConfigType)
  type?: PaymentMethodConfigType;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  processingFee?: number;

  @IsOptional()
  @IsString()
  accountDetails?: string;
}
