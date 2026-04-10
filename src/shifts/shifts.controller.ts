import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ShiftsService } from './shifts.service.js';
import { SalesService } from '../sales/sales.service.js';
import { CloseShiftRequestDto } from './dto/close-shift-request.dto.js';
import { CloseShiftDto } from './dto/close-shift.dto.js';
import { OpenShiftDto } from './dto/open-shift.dto.js';
import { ShiftFilterDto } from './dto/shift-filter.dto.js';
import { ShiftDocument } from './schemas/shift.schema.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserRole } from '../users/schemas/user.schema.js';

@Controller('shifts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ShiftsController {
  constructor(
    private readonly shiftsService: ShiftsService,
    private readonly salesService: SalesService,
  ) {}

  /**
   * Open a new shift
   * POST /shifts/open
   * Requirements: 7.1
   */
  @Post('open')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async openShift(@Body() openShiftDto: OpenShiftDto): Promise<ShiftDocument> {
    return this.shiftsService.openShift(openShiftDto);
  }

  /**
   * Close a shift with cash reconciliation
   * POST /shifts/:id/close
   * Requirements: 7.2
   */
  @Post(':id/close')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.CASHIER)
  async closeShift(
    @Param('id') id: string,
    @Body() closeShiftRequestDto: CloseShiftRequestDto,
  ): Promise<ShiftDocument> {
    const closeShiftDto: CloseShiftDto = {
      shiftId: id,
      closingCash: closeShiftRequestDto.closingCash,
      notes: closeShiftRequestDto.notes,
    };
    // Calculate total sales from actual sales records
    const totalSales = await this.salesService.calculateShiftTotal(id);
    return this.shiftsService.closeShift(closeShiftDto, totalSales);
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
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(@Query() filter: ShiftFilterDto): Promise<ShiftDocument[]> {
    return this.shiftsService.findAll(filter);
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
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByBranch(
    @Param('branchId') branchId: string,
  ): Promise<ShiftDocument[]> {
    return this.shiftsService.findByBranch(branchId);
  }

  /**
   * Get current open shift
   * GET /shifts/current
   */
  @Get('current')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
  )
  async getCurrentShift(
    @Query('branchId') branchId: string,
    @Query('cashierId') cashierId: string,
    @Query('terminalId') terminalId?: string,
  ): Promise<ShiftDocument | null> {
    return this.shiftsService.getCurrentShift(branchId, cashierId, terminalId);
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
  ): Promise<ShiftDocument | null> {
    return this.shiftsService.getOpenShiftForCashier(cashierId);
  }

  /**
   * Get shift report with detailed breakdown
   * GET /shifts/:id/report
   */
  @Get(':id/report')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async getShiftReport(@Param('id') id: string) {
    return this.shiftsService.getShiftReport(id);
  }

  /**
   * Get a single shift by ID
   * GET /shifts/:id
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.PHARMACIST,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string): Promise<ShiftDocument> {
    return this.shiftsService.findById(id);
  }
}
