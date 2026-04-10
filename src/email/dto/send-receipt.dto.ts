import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

/**
 * DTO for sending receipt email
 * Requirements: 4.2, 4.3
 */
export class SendReceiptDto {
  @IsEmail({}, { message: 'Invalid email address format' })
  @IsNotEmpty({ message: 'Email address is required' })
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Sale ID is required' })
  saleId!: string;
}
