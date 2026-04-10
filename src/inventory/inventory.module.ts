import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';
import { StockMovementRepository } from './stock-movement.repository.js';
import {
  StockMovement,
  StockMovementSchema,
} from './schemas/stock-movement.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { BatchesModule } from '../batches/batches.module.js';
import { WebSocketModule } from '../websocket/websocket.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    BatchesModule,
    WebSocketModule,
  ],
  controllers: [InventoryController],
  providers: [InventoryService, StockMovementRepository],
  exports: [InventoryService, StockMovementRepository],
})
export class InventoryModule {}
