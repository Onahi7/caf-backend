import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ShiftsService } from './shifts.service.js';
import { SalesService } from '../sales/sales.service.js';
import { ExpensesService } from '../expenses/expenses.service.js';
import { CloseShiftRequestDto } from './dto/close-shift-request.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { ShiftFilterDto } from './dto/shift-filter.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import {
  assignResolvedBranchId,
  requireResolvedBranchId,
} from '../common/utils/branch-scope.util.js';
import { apiResponse, apiListResponse } from '../common/utils/api-response.util.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';

@ApiTags('Shifts')
@Controller('shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly salesService: SalesService,
    private readonly expensesService: ExpensesService,
  ) {}

  /**
   * Open a new shift
   * POST /shifts/open
   * Requirements: 7.1
   */
  @Post('open')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async openShift(
    @Body() openShiftDto: OpenShiftDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, openShiftDto.branchId);
    const shift = await this.shiftsService.openShift({
      ...openShiftDto,
      branchId: resolvedBranchId,
      cashierId:
        user.role === UserRole.CASHIER ? user.userId : openShiftDto.cashierId,
    });
    return apiResponse(shift);
  }

  /**
   * Close a shift with cash reconciliation
   * POST /shifts/:id/close
   * Requirements: 7.2
   */
  @Post(':id/close')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  async closeShift(
    @Param('id') id: string,
    @Body() closeShiftRequestDto: CloseShiftRequestDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const openShift = await this.shiftsService.findById(id);
    requireResolvedBranchId(user, openShift.branchId.toString());
    if (
      user.role === UserRole.CASHIER &&
      openShift.cashierId.toString() !== user.userId
    ) {
      throw new BadRequestException('Cashiers can only close their own shift');
    }
    const closeShiftDto: CloseShiftDto = {
      shiftId: id,
      closingCash: closeShiftRequestDto.closingCash,
      notes: closeShiftRequestDto.notes,
    };
    // Expected cash uses cash actually collected, not full invoice totals.
    const cashCollections = await this.salesService.calculateShiftCashCollections(id);
    const totalExpenses = await this.expensesService.getTotalByShift(id);
    const netCashMovement = cashCollections - totalExpenses;
    const shift = await this.shiftsService.closeShift(closeShiftDto, netCashMovement);
    return apiResponse(shift);
  }

  /**
   * Get all shifts with optional filtering
   * GET /shifts
   * GET /shifts?branchId={branchId}
   * GET /shifts?cashierId={cashierId}
   * GET /shifts?status=open|closed
   * Requirements: 8.5
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(
    @Query() filter: ShiftFilterDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    assignResolvedBranchId(user, filter);
    const shifts = await this.shiftsService.findAll(filter);
    return apiListResponse(shifts);
  }

  /**
   * Get shifts by branch
   * GET /shifts/branch/:branchId
   * Requirements: 8.5
   */
  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBranch(
    @Param('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    const shifts = await this.shiftsService.findByBranch(resolvedBranchId);
    return apiListResponse(shifts);
  }

  /**
   * Get current open shift
   * GET /shifts/current
   */
  @Get('current')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async getCurrentShift(
    @Query('branchId') branchId: string,
    @CurrentUser() user: CurrentUserData,
    @Query('cashierId') cashierId: string,
    @Query('terminalId') terminalId?: string,
  ) {
    // Non-admin users are always scoped to their assigned branch regardless of incoming query params.
    const requestedBranchId = user.role === UserRole.SUPER_ADMIN ? branchId : undefined;
    const resolvedBranchId = requireResolvedBranchId(user, requestedBranchId);

    // Cashiers can only query their own shift; managers/admins can provide cashierId explicitly.
    const effectiveCashierId =
      user.role === UserRole.CASHIER ? user.userId : cashierId;

    if (!effectiveCashierId) {
      throw new BadRequestException('cashierId is required');
    }

    const shift = await this.shiftsService.getCurrentShift(
      resolvedBranchId,
      effectiveCashierId,
      terminalId,
    );
    return apiResponse(shift);
  }

  /**
   * Get open shift for a cashier
   * GET /shifts/cashier/:cashierId/open
   * Requirements: 7.3
   */
  @Get('cashier/:cashierId/open')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async getOpenShiftForCashier(
    @Param('cashierId') cashierId: string,
  ) {
    const shift = await this.shiftsService.getOpenShiftForCashier(cashierId);
    return apiResponse(shift);
  }

  /**
   * Get shift report with detailed breakdown
   * GET /shifts/:id/report
   */
  @Get(':id/report')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async getShiftReport(@Param('id') id: string) {
    const report = await this.shiftsService.getShiftReport(id);
    return apiResponse(report);
  }

  /**
   * Get a single shift by ID
   * GET /shifts/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string) {
    const shift = await this.shiftsService.findById(id);
    return apiResponse(shift);
  }
}
