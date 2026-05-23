import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CustomerOrder, CustomerOrderSchema } from './schemas/customer-order.schema.js';
import { CustomerOrdersController } from './customer-orders.controller.js';
import { CustomerOrdersService } from './customer-orders.service.js';
import { CustomerOrdersRepository } from './customer-orders.repository.js';
import { CommonServicesModule } from '../common/services/common-services.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: CustomerOrder.name, schema: CustomerOrderSchema }]),
    CommonServicesModule,
  ],
  controllers: [CustomerOrdersController],
  providers: [CustomerOrdersService, CustomerOrdersRepository],
  exports: [CustomerOrdersService],
})
export class CustomerOrdersModule {}
