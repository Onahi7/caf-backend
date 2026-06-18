import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ShiftsRepository } from './shifts.repository.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { ShiftFilterDto } from './dto/shift-filter.dto.js';
import { ShiftDocument, ShiftStatus } from './schemas/shift.schema.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { SalesService } from '../sales/sales.service.js';
import { Connection } from 'mongoose';

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
        await session.abortTransaction();
        throw new ConflictException(
          'Cashier already has an open shift. Please close the existing shift first.',
        );
      }

      const shift = await this.shiftsRepository.create(openShiftDto, session);
      await session.commitTransaction();
      return shift;
    } catch (error) {
      await session.abortTransaction();
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
    totalSalesFormatted: string;
    variance: number;
    varianceFormatted: string;
    formattedOpeningCash: string;
    formattedClosingCash: string;
    formattedExpectedCash: string;
  }> {
    const shift = await this.findById(shiftId);

    // Calculate actual total sales from sales records
    const totalSales = await this.salesService.calculateShiftTotal(shiftId);

    const openingCash = shift.openingCash;
    const expectedCash = shift.expectedCash || (shift.openingCash + totalSales);
    const closingCash = shift.closingCash || 0;
    const variance = shift.variance || 0;

    const branch = await this.branchModel
      .findById(shift.branchId.toString())
      .exec();
    const currencyCode = branch?.currencyCode || 'SLE';

    return {
      shift,
      totalSales,
      totalSalesFormatted: CurrencyUtil.format(totalSales, currencyCode),
      variance,
      varianceFormatted: CurrencyUtil.format(variance, currencyCode),
      formattedOpeningCash: CurrencyUtil.format(openingCash, currencyCode),
      formattedClosingCash: CurrencyUtil.format(closingCash, currencyCode),
      formattedExpectedCash: CurrencyUtil.format(expectedCash, currencyCode),
    };
  }
}
