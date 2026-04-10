import { PartialType } from '@nestjs/mapped-types';
import { CreatePromotionDto } from './create-promotion.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePromotionDto extends PartialType(CreatePromotionDto) {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
