import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FinanceTransactionFilterDto } from './dto/finance-transaction-filter.dto.js';
import {
  FinanceTransaction,
  FinanceTransactionDocument,
  FinanceTransactionType,
} from './schemas/finance-transaction.schema.js';

type DateQuery = {
  $gte?: Date;
  $lte?: Date;
};

interface CreateFinanceTransactionInput {
  branchId: string;
  type: FinanceTransactionType;
  amount: number;
  category: string;
  description?: string;
  reference?: string;
  recordedBy: string;
  marketerId?: string;
  transactionDate: Date;
}

interface TypeSummaryRow {
  type: FinanceTransactionType;
  total: number;
  count: number;
}

interface CategorySummaryRow {
  category: string;
  total: number;
  count: number;
}

export interface FinanceSummaryData {
  totalsByType: Record<FinanceTransactionType, number>;
  cashInTotal: number;
  cashOutTotal: number;
  expenseTotal: number;
  remittanceTotal: number;
  netCashFlow: number;
  transactionCount: number;
  categoryBreakdown: CategorySummaryRow[];
}

@Injectable()
export class FinanceRepository {
  constructor(
    @InjectModel(FinanceTransaction.name)
    private readonly financeTransactionModel: Model<FinanceTransactionDocument>,
  ) {}

  async create(
    input: CreateFinanceTransactionInput,
  ): Promise<FinanceTransactionDocument> {
    const transaction = new this.financeTransactionModel(input);
    return transaction.save();
  }

  async findAll(
    filter: FinanceTransactionFilterDto,
  ): Promise<{ data: FinanceTransactionDocument[]; total: number }> {
    const query = this.buildMatchQuery(filter);
    const page = filter.page || 1;
    const limit = filter.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.financeTransactionModel
        .find(query)
        .populate('recordedBy', 'firstName lastName username role')
        .populate('marketerId', 'firstName lastName username role')
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.financeTransactionModel.countDocuments(query).exec(),
    ]);

    return { data, total };
  }

  async getSummary(filter: FinanceTransactionFilterDto): Promise<FinanceSummaryData> {
    const matchStage = this.buildMatchQuery(filter);

    const [typeTotals, categoryBreakdown] = await Promise.all([
      this.financeTransactionModel
        .aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: '$type',
              total: { $sum: '$amount' },
              count: { $sum: 1 },
            },
          },
          {
            $project: {
              _id: 0,
              type: '$_id',
              total: 1,
              count: 1,
            },
          },
        ])
        .exec() as Promise<TypeSummaryRow[]>,
      this.financeTransactionModel
        .aggregate([
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
        ])
        .exec() as Promise<CategorySummaryRow[]>,
    ]);

    const totalsByType: Record<FinanceTransactionType, number> = {
      [FinanceTransactionType.CASH_IN]: 0,
      [FinanceTransactionType.CASH_OUT]: 0,
      [FinanceTransactionType.EXPENSE]: 0,
      [FinanceTransactionType.MARKETER_REMITTANCE]: 0,
    };

    let transactionCount = 0;

    for (const total of typeTotals) {
      totalsByType[total.type] = total.total;
      transactionCount += total.count;
    }

    const cashInTotal =
      totalsByType[FinanceTransactionType.CASH_IN] +
      totalsByType[FinanceTransactionType.MARKETER_REMITTANCE];
    const cashOutTotal = totalsByType[FinanceTransactionType.CASH_OUT];
    const expenseTotal = totalsByType[FinanceTransactionType.EXPENSE];
    const remittanceTotal =
      totalsByType[FinanceTransactionType.MARKETER_REMITTANCE];
    const netCashFlow = cashInTotal - cashOutTotal - expenseTotal;

    return {
      totalsByType,
      cashInTotal,
      cashOutTotal,
      expenseTotal,
      remittanceTotal,
      netCashFlow,
      transactionCount,
      categoryBreakdown,
    };
  }

  private buildMatchQuery(
    filter: FinanceTransactionFilterDto,
  ): Record<string, unknown> {
    const query: Record<string, unknown> = { isDeleted: false };

    if (filter.branchId) {
      query.branchId = filter.branchId;
    }

    if (filter.type) {
      query.type = filter.type;
    }

    if (filter.category) {
      query.category = filter.category;
    }

    if (filter.marketerId) {
      query.marketerId = filter.marketerId;
    }

    if (filter.recordedBy) {
      query.recordedBy = filter.recordedBy;
    }

    if (filter.startDate || filter.endDate) {
      const dateQuery: DateQuery = {};

      if (filter.startDate) {
        dateQuery.$gte = new Date(filter.startDate);
      }

      if (filter.endDate) {
        dateQuery.$lte = new Date(filter.endDate);
      }

      query.transactionDate = dateQuery;
    }

    return query;
  }
}
