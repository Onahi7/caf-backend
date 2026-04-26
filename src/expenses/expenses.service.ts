import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ExpensesRepository } from './expenses.repository.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseFilterDto } from './dto/expense-filter.dto.js';
import { ExpenseDocument } from './schemas/expense.schema.js';
import { ShiftsRepository } from '../shifts/shifts.repository.js';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly expensesRepository: ExpensesRepository,
    private readonly shiftsRepository: ShiftsRepository,
  ) {}

  /**
   * Create a new expense
   * Validates that the shift is open and belongs to the branch
   */
  async create(createExpenseDto: CreateExpenseDto, userId: string): Promise<ExpenseDocument> {
    // Override recordedBy with the authenticated user's ID
    createExpenseDto.recordedBy = userId as any;

    // Validate shift exists and is open
    const shift = await this.shiftsRepository.findById(
      createExpenseDto.shiftId,
    );

    if (!shift) {
      throw new NotFoundException(
        `Shift with ID ${createExpenseDto.shiftId} not found`,
      );
    }

    if (shift.status !== 'open') {
      throw new BadRequestException('Cannot add expense to a closed shift');
    }

    // Validate shift belongs to the branch
    if (shift.branchId.toString() !== createExpenseDto.branchId) {
      throw new BadRequestException(
        'Shift does not belong to the specified branch',
      );
    }

    return this.expensesRepository.create(createExpenseDto);
  }

  /**
   * Get expense by ID
   */
  async findById(id: string): Promise<ExpenseDocument> {
    const expense = await this.expensesRepository.findById(id);

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    return expense;
  }

  /**
   * Get all expenses with filtering
   */
  async findAll(
    filter: ExpenseFilterDto & { page?: number; limit?: number },
  ): Promise<{ data: ExpenseDocument[]; total: number }> {
    return this.expensesRepository.findAll(filter);
  }

  /**
   * Get expenses for a specific shift
   */
  async findByShift(shiftId: string): Promise<ExpenseDocument[]> {
    return this.expensesRepository.findByShift(shiftId);
  }

  /**
   * Get expenses for a branch
   */
  async findByBranch(
    branchId: string,
    limit?: number,
  ): Promise<ExpenseDocument[]> {
    return this.expensesRepository.findByBranch(branchId, limit);
  }

  /**
   * Get total expenses for a shift
   */
  async getTotalByShift(shiftId: string): Promise<number> {
    return this.expensesRepository.getTotalByShift(shiftId);
  }

  /**
   * Get expense totals by category
   */
  async getTotalByCategory(
    branchId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ category: string; total: number; count: number }[]> {
    return this.expensesRepository.getTotalByCategory(
      branchId,
      startDate,
      endDate,
    );
  }

  /**
   * Soft delete an expense (mark as deleted)
   */
  async softDelete(id: string, deletedBy: string): Promise<ExpenseDocument> {
    const expense = await this.expensesRepository.findById(id);

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    // Check if the shift is still open
    const shift = await this.shiftsRepository.findById(
      expense.shiftId.toString(),
    );

    if (shift && shift.status !== 'open') {
      throw new ForbiddenException('Cannot delete expense from a closed shift');
    }

    const deletedExpense = await this.expensesRepository.softDelete(
      id,
      deletedBy,
    );

    if (!deletedExpense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    return deletedExpense;
  }

  /**
   * Permanently delete an expense
   */
  async delete(id: string): Promise<void> {
    const expense = await this.expensesRepository.findById(id);

    if (!expense) {
      throw new NotFoundException(`Expense with ID ${id} not found`);
    }

    await this.expensesRepository.delete(id);
  }
}
