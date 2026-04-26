import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types, ClientSession } from 'mongoose';
import {
  CycleCount,
  CycleCountDocument,
  CycleCountStatus,
} from './schemas/cycle-count.schema.js';

@Injectable()
export class CycleCountRepository {
  constructor(
    @InjectModel(CycleCount.name)
    private readonly model: Model<CycleCountDocument>,
  ) {}

  async create(data: Partial<CycleCount>): Promise<CycleCountDocument> {
    return this.model.create(data);
  }

  async findById(id: string): Promise<CycleCountDocument | null> {
    return this.model.findById(id).exec();
  }

  async findByBranch(
    branchId: string,
    status?: CycleCountStatus,
  ): Promise<CycleCountDocument[]> {
    const query: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
    };
    if (status) query.status = status;
    return this.model.find(query).sort({ createdAt: -1 }).exec();
  }

  async updateStatus(
    id: string,
    status: CycleCountStatus,
    extra?: Partial<CycleCount>,
    session?: ClientSession,
  ): Promise<CycleCountDocument | null> {
    const update: Record<string, unknown> = { status, ...extra };
    return this.model
      .findByIdAndUpdate(id, update, { new: true, session: session ?? null })
      .exec();
  }

  async updateLines(
    id: string,
    lines: CycleCount['lines'],
  ): Promise<CycleCountDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { lines, status: CycleCountStatus.SUBMITTED },
        { new: true },
      )
      .exec();
  }

  async findActiveDraftForBranch(
    branchId: string,
  ): Promise<CycleCountDocument | null> {
    return this.model
      .findOne({
        branchId: new Types.ObjectId(branchId),
        status: CycleCountStatus.DRAFT,
      })
      .exec();
  }
}
