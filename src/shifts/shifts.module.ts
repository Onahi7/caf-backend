import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShiftsController } from './shifts.controller.js';
import { ShiftsService } from './shifts.service.js';
import { ShiftsRepository } from './shifts.repository.js';
import { Shift, ShiftSchema } from './schemas/shift.schema.js';
import { SalesModule } from '../sales/sales.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Shift.name, schema: ShiftSchema }]),
    forwardRef(() => SalesModule),
  ],
  controllers: [ShiftsController],
  providers: [ShiftsService, ShiftsRepository],
  exports: [ShiftsService, ShiftsRepository],
})
export class ShiftsModule {}
