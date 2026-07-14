import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CycleCount, CycleCountSchema } from './schemas/cycle-count.schema.js';
import { CycleCountRepository } from './cycle-count.repository.js';
import { CycleCountService } from './cycle-count.service.js';
import { CycleCountController } from './cycle-count.controller.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { BatchesModule } from '../batches/batches.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CycleCount.name, schema: CycleCountSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    InventoryModule, // provides StockMovementRepository
    BatchesModule,
  ],
  controllers: [CycleCountController],
  providers: [CycleCountRepository, CycleCountService],
})
export class CycleCountsModule {}
