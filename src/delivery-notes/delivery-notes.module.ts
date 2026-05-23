import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeliveryNote, DeliveryNoteSchema } from './schemas/delivery-note.schema.js';
import { DeliveryNotesController } from './delivery-notes.controller.js';
import { DeliveryNotesService } from './delivery-notes.service.js';
import { DeliveryNotesRepository } from './delivery-notes.repository.js';
import { CommonServicesModule } from '../common/services/common-services.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: DeliveryNote.name, schema: DeliveryNoteSchema }]),
    CommonServicesModule,
  ],
  controllers: [DeliveryNotesController],
  providers: [DeliveryNotesService, DeliveryNotesRepository],
  exports: [DeliveryNotesService],
})
export class DeliveryNotesModule {}
