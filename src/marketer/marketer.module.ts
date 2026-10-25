import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema.js';
import { Product, ProductSchema } from '../products/schemas/product.schema.js';
import { StockMovement, StockMovementSchema } from '../inventory/schemas/stock-movement.schema.js';
import { Batch, BatchSchema } from '../batches/schemas/batch.schema.js';
import {
  MarketerProductAssignment,
  MarketerProductAssignmentSchema,
} from './schemas/marketer-product-assignment.schema.js';
import { MarketerSale, MarketerSaleSchema } from './schemas/marketer-sale.schema.js';
import { FieldZone, FieldZoneSchema, FieldVisitType, FieldVisitTypeSchema } from './schemas/field-zone.schema.js';
import { Facility, FacilitySchema } from './schemas/facility.schema.js';
import { FieldVisit, FieldVisitSchema } from './schemas/field-visit.schema.js';
import { DailyFieldReport, DailyFieldReportSchema } from './schemas/daily-field-report.schema.js';
import { MarketerController } from './marketer.controller.js';
import { MarketerService } from './marketer.service.js';
import { FieldOperationsController } from './field-operations.controller.js';
import { FieldOperationsService } from './field-operations.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MarketerProductAssignment.name, schema: MarketerProductAssignmentSchema },
      { name: MarketerSale.name, schema: MarketerSaleSchema },
      { name: FieldZone.name, schema: FieldZoneSchema },
      { name: FieldVisitType.name, schema: FieldVisitTypeSchema },
      { name: Facility.name, schema: FacilitySchema },
      { name: FieldVisit.name, schema: FieldVisitSchema },
      { name: DailyFieldReport.name, schema: DailyFieldReportSchema },
      { name: User.name, schema: UserSchema },
      { name: Product.name, schema: ProductSchema },
      { name: StockMovement.name, schema: StockMovementSchema },
      { name: Batch.name, schema: BatchSchema },
    ]),
  ],
  controllers: [MarketerController, FieldOperationsController],
  providers: [MarketerService, FieldOperationsService],
  exports: [MarketerService, FieldOperationsService],
})
export class MarketerModule {}
