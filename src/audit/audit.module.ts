import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditController } from './audit.controller.js';
import { AuditService } from './audit.service.js';
import { AuditRepository } from './audit.repository.js';
import { AuditLog, AuditLogSchema } from './schemas/audit-log.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AuditLog.name, schema: AuditLogSchema },
    ]),
  ],
  controllers: [AuditController],
  providers: [AuditService, AuditRepository],
  exports: [AuditService],
})
export class AuditModule {}
