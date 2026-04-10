import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CreateFinanceTransactionDto } from './dto/create-finance-transaction.dto.js';
import { FinanceTransactionFilterDto } from './dto/finance-transaction-filter.dto.js';
import {
  FinanceRepository,
  FinanceSummaryData,
} from './finance.repository.js';
import {
  FinanceTransactionDocument,
  FinanceTransactionType,
} from './schemas/finance-transaction.schema.js';

interface FinanceActor {
  userId: string;
  role: UserRole;
  branchId?: string;
}

@Injectable()
export class FinanceService {
  constructor(private readonly financeRepository: FinanceRepository) {}

  async create(
    createDto: CreateFinanceTransactionDto,
    user: CurrentUserData,
  ): Promise<FinanceTransactionDocument> {
    const actor = this.asActor(user);

    if (
      actor.role === UserRole.MARKETER &&
      createDto.type !== FinanceTransactionType.MARKETER_REMITTANCE
    ) {
      throw new ForbiddenException(
        'Marketers can only record marketer remittance transactions',
      );
    }

    if (
      createDto.marketerId &&
      createDto.type !== FinanceTransactionType.MARKETER_REMITTANCE
    ) {
      throw new BadRequestException(
        'marketerId can only be set for marketer remittance transactions',
      );
    }

    const branchId = this.resolveWriteBranchId(createDto.branchId, actor);

    const marketerId =
      createDto.type === FinanceTransactionType.MARKETER_REMITTANCE
        ? createDto.marketerId ||
          (actor.role === UserRole.MARKETER ? actor.userId : undefined)
        : undefined;

    if (
      createDto.type === FinanceTransactionType.MARKETER_REMITTANCE &&
      !marketerId
    ) {
      throw new BadRequestException(
        'marketerId is required for marketer remittance transactions',
      );
    }

    const transactionDate = createDto.transactionDate
      ? new Date(createDto.transactionDate)
      : new Date();

    return this.financeRepository.create({
      branchId,
      type: createDto.type,
      amount: createDto.amount,
      category: createDto.category,
      description: createDto.description,
      reference: createDto.reference,
      recordedBy: actor.userId,
      marketerId,
      transactionDate,
    });
  }

  async findAll(
    filter: FinanceTransactionFilterDto,
    user: CurrentUserData,
  ): Promise<FinanceTransactionDocument[]> {
    const actor = this.asActor(user);
    const scopedFilter = this.applyReadScope(filter, actor);
    return this.financeRepository.findAll(scopedFilter);
  }

  async getSummary(
    filter: FinanceTransactionFilterDto,
    user: CurrentUserData,
  ): Promise<FinanceSummaryData> {
    const actor = this.asActor(user);
    const scopedFilter = this.applyReadScope(filter, actor);
    return this.financeRepository.getSummary(scopedFilter);
  }

  private asActor(user: CurrentUserData): FinanceActor {
    return {
      userId: user.userId,
      role: user.role as UserRole,
      branchId: user.branchId,
    };
  }

  private resolveWriteBranchId(
    requestedBranchId: string,
    actor: FinanceActor,
  ): string {
    if (actor.role === UserRole.MARKETER && !actor.branchId) {
      throw new ForbiddenException('Marketer is not assigned to a branch');
    }

    if (
      (actor.role === UserRole.BRANCH_MANAGER ||
        actor.role === UserRole.MARKETER) &&
      actor.branchId
    ) {
      if (requestedBranchId !== actor.branchId) {
        throw new ForbiddenException('You can only write records for your branch');
      }

      return actor.branchId;
    }

    return requestedBranchId;
  }

  private applyReadScope(
    filter: FinanceTransactionFilterDto,
    actor: FinanceActor,
  ): FinanceTransactionFilterDto {
    const scopedFilter: FinanceTransactionFilterDto = { ...filter };

    if (actor.role === UserRole.MARKETER && !actor.branchId) {
      throw new ForbiddenException('Marketer is not assigned to a branch');
    }

    if (
      (actor.role === UserRole.BRANCH_MANAGER ||
        actor.role === UserRole.MARKETER) &&
      actor.branchId
    ) {
      if (filter.branchId && filter.branchId !== actor.branchId) {
        throw new ForbiddenException('You can only view records in your branch');
      }

      scopedFilter.branchId = actor.branchId;
    }

    if (actor.role === UserRole.MARKETER) {
      if (
        filter.type &&
        filter.type !== FinanceTransactionType.MARKETER_REMITTANCE
      ) {
        throw new ForbiddenException(
          'Marketers can only view marketer remittance transactions',
        );
      }

      if (filter.marketerId && filter.marketerId !== actor.userId) {
        throw new ForbiddenException('You can only view your own remittances');
      }

      scopedFilter.type = FinanceTransactionType.MARKETER_REMITTANCE;
      scopedFilter.marketerId = actor.userId;
    }

    return scopedFilter;
  }
}
