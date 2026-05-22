import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TransfersController } from './transfers.controller.js';
import { TransfersService } from './transfers.service.js';
import { TransfersRepository } from './transfers.repository.js';
import { Transfer, TransferSchema } from './schemas/transfer.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { BatchesModule } from '../batches/batches.module.js';
import { BranchesModule } from '../branches/branches.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Transfer.name, schema: TransferSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    BatchesModule,
    BranchesModule,
    InventoryModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService, TransfersRepository],
  exports: [TransfersService, TransfersRepository],
})
export class TransfersModule {}
