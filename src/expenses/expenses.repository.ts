import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Expense, ExpenseDocument } from './schemas/expense.schema.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseFilterDto } from './dto/expense-filter.dto.js';

@Injectable()
export class ExpensesRepository {
  constructor(
    @InjectModel(Expense.name) private expenseModel: Model<ExpenseDocument>,
  ) {}

  async create(createExpenseDto: CreateExpenseDto): Promise<ExpenseDocument> {
    const expense = new this.expenseModel(createExpenseDto);
    return expense.save();
  }

  async findById(id: string): Promise<ExpenseDocument | null> {
    return this.expenseModel
      .findOne({ _id: id, isDeleted: false })
      .populate('recordedBy', 'firstName lastName email')
      .exec();
  }

  async findAll(filter: ExpenseFilterDto): Promise<ExpenseDocument[]> {
    const query: any = { isDeleted: false };

    if (filter.branchId) {
      query.branchId = filter.branchId;
    }

    if (filter.shiftId) {
      query.shiftId = filter.shiftId;
    }

    if (filter.recordedBy) {
      query.recordedBy = filter.recordedBy;
    }

    if (filter.category) {
      query.category = filter.category;
    }

    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) {
        query.createdAt.$gte = new Date(filter.startDate);
      }
      if (filter.endDate) {
        query.createdAt.$lte = new Date(filter.endDate);
      }
    }

    return this.expenseModel
      .find(query)
      .populate('recordedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByShift(shiftId: string): Promise<ExpenseDocument[]> {
    return this.expenseModel
      .find({ shiftId, isDeleted: false })
      .populate('recordedBy', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByBranch(
    branchId: string,
    limit?: number,
  ): Promise<ExpenseDocument[]> {
    const query = this.expenseModel
      .find({ branchId, isDeleted: false })
      .populate('recordedBy', 'firstName lastName email')
      .sort({ createdAt: -1 });

    if (limit) {
      query.limit(limit);
    }

    return query.exec();
  }

  async getTotalByShift(shiftId: string): Promise<number> {
    const result = await this.expenseModel.aggregate([
      {
        $match: {
          shiftId: shiftId,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
        },
      },
    ]);

    return result.length > 0 ? result[0].total : 0;
  }

  async getTotalByCategory(
    branchId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ category: string; total: number; count: number }[]> {
    const matchStage: any = {
      branchId,
      isDeleted: false,
    };

    if (startDate || endDate) {
      matchStage.createdAt = {};
      if (startDate) {
        matchStage.createdAt.$gte = startDate;
      }
      if (endDate) {
        matchStage.createdAt.$lte = endDate;
      }
    }

    return this.expenseModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          category: '$_id',
          total: 1,
          count: 1,
        },
      },
      { $sort: { total: -1 } },
    ]);
  }

  async softDelete(
    id: string,
    deletedBy: string,
  ): Promise<ExpenseDocument | null> {
    return this.expenseModel.findByIdAndUpdate(
      id,
      {
        isDeleted: true,
        deletedBy,
        deletedAt: new Date(),
      },
      { new: true },
    );
  }

  async delete(id: string): Promise<void> {
    await this.expenseModel.findByIdAndDelete(id);
  }
}
