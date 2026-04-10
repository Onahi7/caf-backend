import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Shift, ShiftDocument, ShiftStatus } from './schemas/shift.schema.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { ShiftFilterDto } from './dto/shift-filter.dto.js';

@Injectable()
export class ShiftsRepository {
  constructor(
    @InjectModel(Shift.name) private shiftModel: Model<ShiftDocument>,
  ) {}

  async create(openShiftDto: OpenShiftDto): Promise<ShiftDocument> {
    const shift = new this.shiftModel({
      branchId: new Types.ObjectId(openShiftDto.branchId),
      terminalId: openShiftDto.terminalId,
      cashierId: new Types.ObjectId(openShiftDto.cashierId),
      openingCash: openShiftDto.openingCash,
      status: ShiftStatus.OPEN,
      openedAt: new Date(),
    });
    return shift.save();
  }

  async findById(id: string): Promise<ShiftDocument | null> {
    return this.shiftModel.findById(id).exec();
  }

  async findAll(filter?: ShiftFilterDto): Promise<ShiftDocument[]> {
    const query: Record<string, unknown> = {};

    if (filter?.branchId) {
      query.branchId = new Types.ObjectId(filter.branchId);
    }
    if (filter?.cashierId) {
      query.cashierId = new Types.ObjectId(filter.cashierId);
    }
    if (filter?.status) {
      query.status = filter.status;
    }

    let mongoQuery = this.shiftModel.find(query).sort({ openedAt: -1 });

    if (filter?.limit) {
      const limitNum = parseInt(filter.limit, 10);
      if (!isNaN(limitNum) && limitNum > 0) {
        mongoQuery = mongoQuery.limit(limitNum);
      }
    }

    return mongoQuery.exec();
  }

  async findByBranch(branchId: string): Promise<ShiftDocument[]> {
    return this.shiftModel
      .find({ branchId: new Types.ObjectId(branchId) })
      .sort({ openedAt: -1 })
      .exec();
  }

  /**
   * Find open shift for a cashier at a branch
   * A cashier can only have one open shift at a time
   */
  async findOpenShiftByCashier(
    branchId: string,
    cashierId: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftModel
      .findOne({
        branchId: new Types.ObjectId(branchId),
        cashierId: new Types.ObjectId(cashierId),
        status: ShiftStatus.OPEN,
      })
      .exec();
  }

  /**
   * Find any open shift for a cashier (across all branches)
   */
  async findOpenShiftForCashier(
    cashierId: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftModel
      .findOne({
        cashierId: new Types.ObjectId(cashierId),
        status: ShiftStatus.OPEN,
      })
      .exec();
  }

  /**
   * Close a shift with reconciliation data
   */
  async closeShift(
    id: string,
    closingCash: number,
    expectedCash: number,
    notes?: string,
  ): Promise<ShiftDocument | null> {
    const variance = closingCash - expectedCash;

    return this.shiftModel
      .findByIdAndUpdate(
        id,
        {
          closingCash,
          expectedCash,
          variance,
          status: ShiftStatus.CLOSED,
          closedAt: new Date(),
          notes,
        },
        { new: true },
      )
      .exec();
  }

  async update(
    id: string,
    updateData: Partial<Shift>,
  ): Promise<ShiftDocument | null> {
    return this.shiftModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .exec();
  }

  /**
   * Find current open shift for a cashier at a branch/terminal
   */
  async findCurrentShift(
    branchId: string,
    cashierId: string,
    terminalId?: string,
  ): Promise<ShiftDocument | null> {
    const query: Record<string, unknown> = {
      branchId: new Types.ObjectId(branchId),
      cashierId: new Types.ObjectId(cashierId),
      status: ShiftStatus.OPEN,
    };

    if (terminalId) {
      query.terminalId = terminalId;
    }

    return this.shiftModel.findOne(query).exec();
  }
}
