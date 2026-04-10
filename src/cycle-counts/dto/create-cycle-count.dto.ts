import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CreateCycleCountDto {
  @IsMongoId()
  branchId!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
