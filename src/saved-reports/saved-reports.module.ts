import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SavedReportsController } from './saved-reports.controller.js';
import { SavedReportsService } from './saved-reports.service.js';
import { SavedReport, SavedReportSchema } from './schemas/saved-report.schema.js';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: SavedReport.name, schema: SavedReportSchema },
    ]),
  ],
  controllers: [SavedReportsController],
  providers: [SavedReportsService],
  exports: [SavedReportsService],
})
export class SavedReportsModule {}
