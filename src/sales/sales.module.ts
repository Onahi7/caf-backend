import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Sale, SaleSchema } from './schemas/sale.schema.js';
import { SalesRepository } from './sales.repository.js';
import { SalesService } from './sales.service.js';
import { CheckoutService } from './checkout.service.js';
import { ReceiptService } from './receipt.service.js';
import { SalesController } from './sales.controller.js';
import { BatchesModule } from '../batches/batches.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ShiftsModule } from '../shifts/shifts.module.js';
import { ProductsModule } from '../products/products.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { WebSocketModule } from '../websocket/websocket.module.js';
import { EmailModule } from '../email/email.module.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

/**
 * SalesModule
 * Provides POS functionality including checkout, returns, and prescription management
 * Requirements: 6.3, 6.4, 6.5, 11.1, 11.4, 11.5, 22.1, 22.3, 22.4
 */
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Sale.name, schema: SaleSchema }]),
    forwardRef(() => BatchesModule),
    forwardRef(() => InventoryModule),
    forwardRef(() => ShiftsModule),
    forwardRef(() => ProductsModule),
    forwardRef(() => AuthModule),
    forwardRef(() => EmailModule),
    WebSocketModule,
  ],
  controllers: [SalesController],
  providers: [SalesRepository, SalesService, CheckoutService, ReceiptService, IdempotencyGuard, IdempotencyInterceptor],
  exports: [SalesRepository, SalesService, CheckoutService, ReceiptService],
})
export class SalesModule {}
