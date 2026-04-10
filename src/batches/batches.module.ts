import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BatchesController } from './batches.controller.js';
import { BatchesService } from './batches.service.js';
import { BatchesRepository } from './batches.repository.js';
import { Batch, BatchSchema } from './schemas/batch.schema.js';
import { WebSocketModule } from '../websocket/websocket.module.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Batch.name, schema: BatchSchema }]),
    WebSocketModule,
  ],
  controllers: [BatchesController],
  providers: [BatchesService, BatchesRepository],
  exports: [BatchesService, BatchesRepository],
})
export class BatchesModule {}
