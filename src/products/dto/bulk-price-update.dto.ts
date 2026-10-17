import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsMongoId,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

class PricingStrategyDto {
  @IsBoolean()
  useProductBasePrice!: boolean;
  @IsBoolean()
  useLatestBatchPrice!: boolean;
  @IsBoolean()
  useCostPlusMarkup!: boolean;
  @IsOptional()
  @IsNumber()
  @Min(0)
  markupPercentage?: number;
}

export class BulkPriceUpdateDto {
  @IsDefined()
  @ValidateNested()
  @Type(() => PricingStrategyDto)
  strategy!: PricingStrategyDto;
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  applyToProducts?: string[];
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  applyToBranches?: string[];
  @IsOptional()
  @IsNumber()
  @Min(0)
  newBasePrice?: number;
  @IsOptional()
  @IsNumber()
  @Min(0)
  newMarkupPercentage?: number;
}
