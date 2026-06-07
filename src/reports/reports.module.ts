import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReportsService } from './reports.service.js';
import { ValuationService } from './valuation.service.js';
import { ExportService } from './export.service.js';
import { ReportsController } from './reports.controller.js';
import { Sale, SaleSchema } from '../sales/schemas/sale.schema.js';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { Branch, BranchSchema } from '../branches/schemas/branch.schema.js';
import {
  Transfer,
  TransferSchema,
} from '../transfers/schemas/transfer.schema.js';
import {
  StockMovement,
  StockMovementSchema,
} from '../inventory/schemas/stock-movement.schema.js';
import {
  PurchaseOrder,
  PurchaseOrderSchema,
} from '../purchases/schemas/purchase-order.schema.js';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Sale.name, schema: SaleSchema },
      { name: Batch.name, schema: BatchSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Branch.name, schema: BranchSchema },
      { name: Transfer.name, schema: TransferSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: PurchaseOrder.name, schema: PurchaseOrderSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ReportsController],
  providers: [ReportsService, ValuationService, ExportService],
  exports: [ReportsService, ValuationService, ExportService],
})
export class ReportsModule {}
