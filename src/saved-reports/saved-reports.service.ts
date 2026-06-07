import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  SavedReport,
  SavedReportDocument,
} from './schemas/saved-report.schema.js';
import {
  CreateSavedReportDto,
  UpdateSavedReportDto,
} from './dto/saved-report.dto.js';

@Injectable()
export class SavedReportsService {
  constructor(
    @InjectModel(SavedReport.name)
    private readonly model: Model<SavedReportDocument>,
  ) {}

  async list(userId: string): Promise<SavedReportDocument[]> {
    return this.model
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async get(id: string, userId: string): Promise<SavedReportDocument> {
    const doc = await this.model
      .findOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();
    if (!doc) throw new NotFoundException('Saved report not found');
    return doc;
  }

  async create(userId: string, dto: CreateSavedReportDto): Promise<SavedReportDocument> {
    return this.model.create({
      userId: new Types.ObjectId(userId),
      name: dto.name,
      description: dto.description,
      reportKey: dto.reportKey,
      route: dto.route,
      params: dto.params,
      schedule: dto.schedule ?? 'none',
      recipients: dto.recipients ?? [],
    });
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateSavedReportDto,
  ): Promise<SavedReportDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) },
        { $set: dto },
        { new: true },
      )
      .exec();
    if (!doc) throw new NotFoundException('Saved report not found');
    return doc;
  }

  async remove(id: string, userId: string): Promise<void> {
    const res = await this.model
      .deleteOne({ _id: new Types.ObjectId(id), userId: new Types.ObjectId(userId) })
      .exec();
    if (res.deletedCount === 0) {
      throw new NotFoundException('Saved report not found');
    }
  }
}
