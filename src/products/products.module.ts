import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema.js';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { PricingService } from './pricing.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
    InventoryModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsRepository, ProductsService, PricingService],
  exports: [ProductsService, ProductsRepository, PricingService],
})
export class ProductsModule {}
