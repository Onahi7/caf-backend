import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ShiftsRepository } from './shifts.repository.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { ShiftFilterDto } from './dto/shift-filter.dto.js';
import { ShiftDocument, ShiftStatus } from './schemas/shift.schema.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { SalesService } from '../sales/sales.service.js';
import { Connection } from 'mongoose';
import {
  PaymentMethod,
  SaleDocument,
  SaleStatus,
} from '../sales/schemas/sale.schema.js';

export interface PaymentMethodTotal {
  paymentMethod: string;
  total: number;
}

@Injectable()
export class ShiftsService {
  constructor(
    private readonly shiftsRepository: ShiftsRepository,
    @Inject(forwardRef(() => SalesService))
    private readonly salesService: SalesService,
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  /**
   * Validate cash amount
   */
  private validateCashAmount(amount: number, fieldName: string): void {
    if (!Number.isFinite(amount)) {
      throw new BadRequestException(
        `Invalid ${fieldName}: must be a finite number`,
      );
    }
    if (amount < 0) {
      throw new BadRequestException(
        `Invalid ${fieldName}: cannot be negative`,
      );
    }
  }

  private calculatePaymentMethodTotals(sales: SaleDocument[]): PaymentMethodTotal[] {
    const totals = new Map<string, number>();

    for (const sale of sales) {
      const returnedAmount = sale.returnedAmount || 0;

      if (sale.payments?.length) {
        for (const payment of sale.payments) {
          const previous = totals.get(payment.paymentMethod) || 0;
          totals.set(payment.paymentMethod, previous + (payment.amount || 0));
        }

        if (returnedAmount > 0) {
          const firstMethod = sale.payments[0]?.paymentMethod || sale.paymentMethod;
          totals.set(firstMethod, (totals.get(firstMethod) || 0) - returnedAmount);
        }
        continue;
      }

      const previous = totals.get(sale.paymentMethod) || 0;
      totals.set(sale.paymentMethod, previous + (sale.total || 0) - returnedAmount);
    }

    return Object.values(PaymentMethod).map((paymentMethod) => ({
      paymentMethod,
      total: totals.get(paymentMethod) || 0,
    }));
  }

  /**
   * Open a new shift for a cashier
   * Requirements: 7.1
   * Properties: 26 (Shift opening completeness)
   * Uses transaction to prevent race conditions on concurrent open requests
   */
  async openShift(openShiftDto: OpenShiftDto): Promise<ShiftDocument> {
    // Validate required fields
    if (
      !openShiftDto.branchId ||
      !openShiftDto.terminalId ||
      !openShiftDto.cashierId
    ) {
      throw new BadRequestException(
        'Missing required fields: branchId, terminalId, or cashierId',
      );
    }

    if (
      !Types.ObjectId.isValid(openShiftDto.branchId) ||
      !Types.ObjectId.isValid(openShiftDto.cashierId)
    ) {
      throw new BadRequestException('Invalid branchId or cashierId');
    }

    if (openShiftDto.openingCash === undefined || openShiftDto.openingCash === null) {
      throw new BadRequestException(
        'Opening cash amount is required',
      );
    }

    // Validate opening cash amount
    this.validateCashAmount(openShiftDto.openingCash, 'openingCash');

    // Use transaction to prevent race conditions on concurrent open requests
    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      // Check if cashier already has an open shift (inside transaction)
      const existingOpenShift =
        await this.shiftsRepository.findOpenShiftForCashier(
          openShiftDto.cashierId,
          session, // Pass session for consistency
      );

      if (existingOpenShift) {
        throw new ConflictException(
          'Cashier already has an open shift. Please close the existing shift first.',
        );
      }

      const shift = await this.shiftsRepository.create(openShiftDto, session);
      await session.commitTransaction();
      return shift;
    } catch (error) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Close a shift with cash reconciliation
   * Requirements: 7.2, 7.4
   * Properties: 27 (Shift closing calculations), 29 (Closed shift immutability)
   */
  async closeShift(
    closeShiftDto: CloseShiftDto,
    totalSales: number,
  ): Promise<ShiftDocument> {
    // Validate inputs
    if (!closeShiftDto.shiftId) {
      throw new BadRequestException('Shift ID is required');
    }

    if (closeShiftDto.closingCash === undefined || closeShiftDto.closingCash === null) {
      throw new BadRequestException('Closing cash amount is required');
    }

    this.validateCashAmount(closeShiftDto.closingCash, 'closingCash');
    this.validateCashAmount(totalSales, 'totalSales');

    const shift = await this.shiftsRepository.findById(closeShiftDto.shiftId);

    if (!shift) {
      throw new NotFoundException(
        `Shift with ID ${closeShiftDto.shiftId} not found`,
      );
    }

    if (shift.status === ShiftStatus.CLOSED) {
      throw new BadRequestException('Shift is already closed');
    }

    // Calculate expected cash: opening cash + total sales
    const expectedCash = shift.openingCash + totalSales;

    const closedShift = await this.shiftsRepository.closeShift(
      closeShiftDto.shiftId,
      closeShiftDto.closingCash,
      expectedCash,
      closeShiftDto.notes,
    );

    if (!closedShift) {
      throw new NotFoundException(
        `Shift with ID ${closeShiftDto.shiftId} not found`,
      );
    }

    return closedShift;
  }

  /**
   * Validate that a cashier has an open shift before processing a sale
   * Requirements: 7.3
   * Properties: 28 (Sales require open shift)
   */
  async validateOpenShift(cashierId: string): Promise<ShiftDocument> {
    if (!cashierId) {
      throw new BadRequestException('Cashier ID is required');
    }

    const openShift =
      await this.shiftsRepository.findOpenShiftForCashier(cashierId);

    if (!openShift) {
      throw new BadRequestException(
        'Cashier does not have an open shift. Please open a shift before processing sales.',
      );
    }

    return openShift;
  }

  /**
   * Get open shift for a cashier at a specific branch
   */
  async getOpenShiftByCashier(
    branchId: string,
    cashierId: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftsRepository.findOpenShiftByCashier(branchId, cashierId);
  }

  /**
   * Get open shift for a cashier (any branch)
   */
  async getOpenShiftForCashier(
    cashierId: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftsRepository.findOpenShiftForCashier(cashierId);
  }

  /**
   * Find shift by ID
   */
  async findById(id: string): Promise<ShiftDocument> {
    const shift = await this.shiftsRepository.findById(id);
    if (!shift) {
      throw new NotFoundException(`Shift with ID ${id} not found`);
    }
    return shift;
  }

  /**
   * Find all shifts with optional filtering
   * Requirements: 8.5
   */
  async findAll(filter?: ShiftFilterDto): Promise<ShiftDocument[]> {
    return this.shiftsRepository.findAll(filter);
  }

  /**
   * Find shifts by branch
   * Requirements: 8.5
   * Properties: 35 (Branch shift isolation)
   */
  async findByBranch(branchId: string): Promise<ShiftDocument[]> {
    return this.shiftsRepository.findByBranch(branchId);
  }

  /**
   * Check if a shift is open and can accept sales
   * Requirements: 7.3, 7.4
   */
  async canAcceptSales(shiftId: string): Promise<boolean> {
    const shift = await this.shiftsRepository.findById(shiftId);
    return shift !== null && shift.status === ShiftStatus.OPEN;
  }

  /**
   * Get current open shift for a cashier at a branch
   */
  async getCurrentShift(
    branchId: string,
    cashierId: string,
    terminalId?: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftsRepository.findCurrentShift(
      branchId,
      cashierId,
      terminalId,
    );
  }

  /**
   * Get detailed shift report
   * Requirements: 4.2
   * Property 11: Report currency formatting
   */
  async getShiftReport(shiftId: string): Promise<{
    shift: ShiftDocument;
    totalSales: number;
    netSales: number;
    salesCount: number;
    voidsCount: number;
    refundsCount: number;
    openedAt: Date;
    closedAt?: Date;
    cashierName: string;
    branchName: string;
    openingCash: number;
    closingCash: number;
    expectedCash: number;
    totalCashSales: number;
    totalCardSales: number;
    totalMobileSales: number;
    paymentMethodTotals: PaymentMethodTotal[];
    totalSalesFormatted: string;
    variance: number;
    varianceFormatted: string;
    formattedOpeningCash: string;
    formattedClosingCash: string;
    formattedExpectedCash: string;
  }> {
    const shift = await this.findById(shiftId);
    await shift.populate([
      { path: 'branchId', select: 'name code currencyCode' },
      { path: 'cashierId', select: 'firstName lastName username' },
    ]);

    // Calculate actual total sales from sales records
    const sales = await this.salesService.findByShift(shiftId);
    const totalSales = sales.reduce(
      (sum, sale) => sum + (sale.total || 0) - (sale.returnedAmount || 0),
      0,
    );
    const paymentMethodTotals = this.calculatePaymentMethodTotals(sales);
    const totalCashSales =
      paymentMethodTotals.find((item) => item.paymentMethod === PaymentMethod.CASH)
        ?.total || 0;
    const totalCardSales =
      paymentMethodTotals.find((item) => item.paymentMethod === PaymentMethod.CARD)
        ?.total || 0;
    const totalMobileSales = paymentMethodTotals
      .filter((item) =>
        [
          PaymentMethod.ORANGE_MONEY,
          PaymentMethod.AFRICELL_MONEY,
          PaymentMethod.QMONEY,
          PaymentMethod.MOBILE,
        ].includes(item.paymentMethod as PaymentMethod),
      )
      .reduce((sum, item) => sum + item.total, 0);

    const openingCash = shift.openingCash;
    const expectedCash = shift.expectedCash || (shift.openingCash + totalSales);
    const closingCash = shift.closingCash || 0;
    const variance = shift.variance || 0;

    const branch =
      typeof shift.branchId === 'object' && 'currencyCode' in shift.branchId
        ? (shift.branchId as unknown as { name?: string; currencyCode?: string })
        : await this.branchModel.findById(shift.branchId.toString()).exec();
    const cashier =
      typeof shift.cashierId === 'object' && 'username' in shift.cashierId
        ? (shift.cashierId as unknown as {
            firstName?: string;
            lastName?: string;
            username?: string;
          })
        : null;
    const currencyCode = branch?.currencyCode || 'SLE';
    const cashierName =
      [cashier?.firstName, cashier?.lastName].filter(Boolean).join(' ') ||
      cashier?.username ||
      'Cashier';

    return {
      shift,
      totalSales,
      netSales: totalSales,
      salesCount: sales.length,
      voidsCount: 0,
      refundsCount: sales.filter((sale) =>
        [SaleStatus.RETURNED, SaleStatus.PARTIALLY_RETURNED].includes(sale.status),
      ).length,
      openedAt: shift.openedAt,
      closedAt: shift.closedAt,
      cashierName,
      branchName: branch?.name || 'Outlet',
      openingCash,
      closingCash,
      expectedCash,
      totalCashSales,
      totalCardSales,
      totalMobileSales,
      paymentMethodTotals,
      totalSalesFormatted: CurrencyUtil.format(totalSales, currencyCode),
      variance,
      varianceFormatted: CurrencyUtil.format(variance, currencyCode),
      formattedOpeningCash: CurrencyUtil.format(openingCash, currencyCode),
      formattedClosingCash: CurrencyUtil.format(closingCash, currencyCode),
      formattedExpectedCash: CurrencyUtil.format(expectedCash, currencyCode),
    };
  }
}
