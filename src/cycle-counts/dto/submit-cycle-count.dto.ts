import {
  IsArray,
  IsNumber,
  IsMongoId,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitLineDto {
  @IsMongoId()
  batchId!: string;

  @IsNumber()
  @Min(0)
  countedQuantity!: number;
}

export class SubmitCycleCountDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitLineDto)
  lines!: SubmitLineDto[];
}
