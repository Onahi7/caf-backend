import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import {
  EmailTemplate,
  EmailTemplateSchema,
} from './schemas/email-template.schema';
import { EmailLog, EmailLogSchema } from './schemas/email-log.schema';

/**
 * Email Module
 * Provides email functionality for the application
 * Requirements: 4.1
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: User.name, schema: UserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: EmailTemplate.name, schema: EmailTemplateSchema },
      { name: EmailLog.name, schema: EmailLogSchema },
    ]),
  ],
  controllers: [EmailController],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
