import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema.js';
import {
  MarketerProductAssignment,
  MarketerProductAssignmentSchema,
} from './schemas/marketer-product-assignment.schema.js';
import { MarketerSale, MarketerSaleSchema } from './schemas/marketer-sale.schema.js';
import { MarketerController } from './marketer.controller.js';
import { MarketerService } from './marketer.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketerProductAssignment.name, schema: MarketerProductAssignmentSchema },
      { name: MarketerSale.name, schema: MarketerSaleSchema },
      { name: User.name, schema: UserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
    ]),
  ],
  controllers: [MarketerController],
  providers: [MarketerService],
  exports: [MarketerService],
})
export class MarketerModule {}
