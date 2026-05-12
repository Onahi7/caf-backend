import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Product, ProductSchema } from './schemas/product.schema.js';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';
import { ProductsController } from './products.controller.js';
import { PricingService } from './pricing.service.js';
import { ProductExcelService } from './product-excel.service.js';
import { RequestAnalysisService } from './request-analysis.service.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { UsersModule } from '../users/users.module.js';
import { BranchesModule } from '../branches/branches.module.js';
import { SuppliersModule } from '../suppliers/suppliers.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
    InventoryModule,
    AuditModule,
    UsersModule,
    BranchesModule,
    SuppliersModule,
  ],
  controllers: [ProductsController],
  providers: [
    ProductsRepository,
    ProductsService,
    PricingService,
    ProductExcelService,
    RequestAnalysisService,
  ],
  exports: [ProductsService, ProductsRepository, PricingService],
})
export class ProductsModule {}
