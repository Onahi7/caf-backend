import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';
import { PurchasesRepository } from './purchases.repository.js';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from './schemas/purchase-order.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { BatchesModule } from '../batches/batches.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    BatchesModule,
    InventoryModule,
  ],
  controllers: [PurchasesController],
  providers: [PurchasesService, PurchasesRepository, IdempotencyGuard, IdempotencyInterceptor],
  exports: [PurchasesService, PurchasesRepository],
})
export class PurchasesModule {}
