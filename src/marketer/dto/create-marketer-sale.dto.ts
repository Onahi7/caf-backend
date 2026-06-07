import { IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateMarketerSaleDto {
  @IsMongoId()
  assignmentId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}
