import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import {
  CurrentUser,
} from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import {
  assignResolvedBranchId,
  requireResolvedBranchId,
  resolveBranchId,
} from '../common/utils/branch-scope.util.js';
import { ReportsService } from './reports.service.js';
import { ValuationService } from './valuation.service.js';
import { ExportService, ExportFormat } from './export.service.js';
import {
  SalesReportDto,
  InventoryReportDto,
  ExpiryReportDto,
  TransferReportDto,
  ValuationMethod,
} from './dto/index.js';

/**
 * ReportsController
 * Handles report generation and export endpoints
 * Requirements: 12.1, 13.1, 14.1, 14.2, 14.3
 */
@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name);

  constructor(
    private readonly reportsService: ReportsService,
    private readonly valuationService: ValuationService,
    private readonly exportService: ExportService,
  ) {}

  private normalizeExportFormat(format?: string): ExportFormat {
    switch ((format || '').toLowerCase()) {
      case 'excel':
      case 'xlsx':
      case 'csv':
        return ExportFormat.EXCEL;
      case 'pdf':
      default:
        return ExportFormat.PDF;
    }
  }


  /**
   * GET /reports/dashboard-stats
   * Get dashboard statistics for a branch
   * Requirements: 14.1
   */
  @Get('dashboard-stats')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async getDashboardStats(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
  ) {
    const resolvedBranchId = requireResolvedBranchId(user, branchId);
    this.logger.log(`Getting dashboard stats for branch: ${resolvedBranchId}`);
    return this.reportsService.getDashboardStats(resolvedBranchId);
  }

  /**
   * GET /reports/hq/sales
   * Legacy HQ alias for sales report
   */
  @Get('hq/sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getHqSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: SalesReportDto,
  ) {
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateSalesReport(dto);
  }

  /**
   * GET /reports/hq/inventory
   * Legacy HQ alias for inventory report
   */
  @Get('hq/inventory')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getHqInventoryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: InventoryReportDto,
  ) {
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateInventoryReport(dto);
  }

  /**
   * GET /reports/hq/expiry
   * Legacy HQ alias for expiry report
   */
  @Get('hq/expiry')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getHqExpiryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ExpiryReportDto,
  ) {
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateExpiryReport(dto);
  }

  /**
   * GET /reports/hq/low-stock
   * Legacy HQ alias for low-stock report view
   */
  @Get('hq/low-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getHqLowStockReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: InventoryReportDto,
  ) {
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateInventoryReport({
      ...dto,
      lowStockOnly: true,
    });
  }

  /**
   * GET /reports/sales
   * Generate sales report with optional export
   * Requirements: 14.1, 14.5
   * Property 56: Sales report filtering
   * Property 60: Report export formats
   */
  @Get('sales')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: SalesReportDto,
    @Query('export') exportFormat: string,
    @Res() res: Response,
  ) {
    this.logger.log('Generating sales report');
    assignResolvedBranchId(user, dto);

    const report = await this.reportsService.generateSalesReport(dto);

    // Handle export if requested
    if (exportFormat === ExportFormat.PDF) {
      const pdfBuffer = await this.exportService.exportSalesReportToPDF(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=sales-report-${Date.now()}.pdf`,
      );
      return res.send(pdfBuffer);
    } else if (exportFormat === ExportFormat.EXCEL) {
      const excelBuffer =
        await this.exportService.exportSalesReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=sales-report-${Date.now()}.xlsx`,
      );
      return res.send(excelBuffer);
    }

    // Return JSON by default
    return res.status(HttpStatus.OK).json(report);
  }

  /**
   * GET /reports/sales/export
   * Alias export endpoint for frontend compatibility
   */
  @Get('sales/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: SalesReportDto,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    return this.getSalesReport(user, dto, this.normalizeExportFormat(format), res);
  }

  /**
   * GET /reports/inventory
   * Generate inventory report with valuation
   * Requirements: 13.1, 13.2, 14.2, 14.5
   * Property 57: Inventory report completeness
   * Property 54: Valuation report structure
   */
  @Get('inventory')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getInventoryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: InventoryReportDto,
    @Query('export') exportFormat: string,
    @Res() res: Response,
  ) {
    this.logger.log('Generating inventory report');
    assignResolvedBranchId(user, dto);

    const report = await this.reportsService.generateInventoryReport(dto);

    // Handle export if requested
    if (exportFormat === ExportFormat.PDF) {
      const pdfBuffer =
        await this.exportService.exportInventoryReportToPDF(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=inventory-report-${Date.now()}.pdf`,
      );
      return res.send(pdfBuffer);
    } else if (exportFormat === ExportFormat.EXCEL) {
      const excelBuffer =
        await this.exportService.exportInventoryReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=inventory-report-${Date.now()}.xlsx`,
      );
      return res.send(excelBuffer);
    }

    // Return JSON by default
    return res.status(HttpStatus.OK).json(report);
  }

  /**
   * GET /reports/inventory/export
   * Alias export endpoint for frontend compatibility
   */
  @Get('inventory/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportInventoryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: InventoryReportDto,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    return this.getInventoryReport(
      user,
      dto,
      this.normalizeExportFormat(format),
      res,
    );
  }

  /**
   * GET /reports/expiry
   * Generate expiry report
   * Requirements: 12.1, 12.3, 12.4, 14.5
   * Property 49: Expiry report filtering
   * Property 51: Expiry loss calculation
   */
  @Get('expiry')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async getExpiryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ExpiryReportDto,
    @Query('export') exportFormat: string,
    @Res() res: Response,
  ) {
    this.logger.log('Generating expiry report');
    assignResolvedBranchId(user, dto);

    const report = await this.reportsService.generateExpiryReport(dto);

    // Handle export if requested
    if (exportFormat === ExportFormat.PDF) {
      const pdfBuffer =
        await this.exportService.exportExpiryReportToPDF(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=expiry-report-${Date.now()}.pdf`,
      );
      return res.send(pdfBuffer);
    } else if (exportFormat === ExportFormat.EXCEL) {
      const excelBuffer =
        await this.exportService.exportExpiryReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=expiry-report-${Date.now()}.xlsx`,
      );
      return res.send(excelBuffer);
    }

    // Return JSON by default
    return res.status(HttpStatus.OK).json(report);
  }

  /**
   * GET /reports/expiry/export
   * Alias export endpoint for frontend compatibility
   */
  @Get('expiry/export')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async exportExpiryReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ExpiryReportDto,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    return this.getExpiryReport(user, dto, this.normalizeExportFormat(format), res);
  }

  /**
   * GET /reports/transfers
   * Generate transfer report
   * Requirements: 14.3, 14.5
   * Property 58: Transfer log structure
   */
  @Get('transfers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getTransferReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: TransferReportDto,
    @Query('export') exportFormat: string,
    @Res() res: Response,
  ) {
    this.logger.log('Generating transfer report');
    assignResolvedBranchId(user, dto);

    const report = await this.reportsService.generateTransferReport(dto);

    // Handle export if requested
    if (exportFormat === ExportFormat.PDF) {
      const pdfBuffer =
        await this.exportService.exportTransferReportToPDF(report);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=transfer-report-${Date.now()}.pdf`,
      );
      return res.send(pdfBuffer);
    } else if (exportFormat === ExportFormat.EXCEL) {
      const excelBuffer =
        await this.exportService.exportTransferReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=transfer-report-${Date.now()}.xlsx`,
      );
      return res.send(excelBuffer);
    }

    // Return JSON by default
    return res.status(HttpStatus.OK).json(report);
  }

  /**
   * GET /reports/transfers/export
   * Alias export endpoint for frontend compatibility
   */
  @Get('transfers/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportTransferReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: TransferReportDto,
    @Query('format') format: string,
    @Res() res: Response,
  ) {
    return this.getTransferReport(
      user,
      dto,
      this.normalizeExportFormat(format),
      res,
    );
  }

  /**
   * GET /reports/valuation
   * Get inventory valuation for a branch
   * Requirements: 13.1, 13.4
   * Property 53: Valuation method support
   */
  @Get('valuation')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getValuation(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('method') method: ValuationMethod = ValuationMethod.FIFO,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    this.logger.log(`Getting valuation for branch ${resolvedBranchId} using ${method}`);

    if (!resolvedBranchId) {
      // Super admin cross-branch valuation
      return this.valuationService.calculateCompanyWideValue(method);
    }

    const valuations = await this.valuationService.calculateBranchValuation(
      resolvedBranchId,
      method,
    );

    const totalValue = valuations.reduce((sum, v) => sum + v.totalValue, 0);

    return {
      branchId: resolvedBranchId,
      method,
      totalValue,
      products: valuations,
    };
  }

  /**
   * GET /reports/cogs
   * Calculate COGS for a sale
   * Requirements: 13.4
   * Property 55: COGS tracking
   */
  @Get('cogs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getCOGS(
    @CurrentUser() user: CurrentUserData,
    @Query('saleId') saleId: string,
    @Query('items') itemsJson: string,
  ) {
    this.logger.log(`Calculating COGS for sale ${saleId} requested by ${user.userId}`);

    const items = JSON.parse(itemsJson);
    return this.valuationService.calculateCOGS(saleId, items);
  }

  /**
   * GET /reports/customers
   * Generate customer analytics report
   */
  @Get('customers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getCustomerReport(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
  ) {
    // Enforce branch scoping
    resolveBranchId(user, branchId);
    this.logger.log(`Generating customer report from ${from} to ${to}`);

    // Return mock data for now - implement actual logic later
    return {
      totalCustomers: 0,
      activeCustomers: 0,
      newCustomers: 0,
      totalLoyaltyPoints: 0,
      topCustomers: [],
      byPeriod: [],
      segmentation: {
        highValue: 0,
        medium: 0,
        low: 0,
        inactive: 0,
      },
    };
  }

  /**
   * GET /reports/customers/export
   * Export customer report to CSV
   */
  @Get('customers/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportCustomerReport(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
    @Query('format') _format: string = 'csv',
    @Res() res: Response,
  ) {
    resolveBranchId(user, branchId);
    this.logger.log(`Exporting customer report from ${from} to ${to}`);

    // Return empty CSV for now
    const csv = 'Customer Name,Total Purchases,Purchase Count,Loyalty Points\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=customer-report-${from}-${to}.csv`,
    );
    return res.send(csv);
  }

  /**
   * GET /reports/purchases
   * Generate purchase reports
   */
  @Get('purchases')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getPurchaseReport(
    @CurrentUser() user: CurrentUserData,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
    @Query('branchId') branchId?: string,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    this.logger.log(`Generating purchase report from ${from} to ${to} for branch ${resolvedBranchId}`);

    // Return mock data for now
    return {
      totalPurchases: 0,
      totalAmount: 0,
      totalItems: 0,
      bySupplier: [],
      byProduct: [],
      byPeriod: [],
    };
  }

  /**
   * GET /reports/purchases/export
   * Export purchase report
   */
  @Get('purchases/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportPurchaseReport(
    @CurrentUser() user: CurrentUserData,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
    @Query('branchId') branchId: string,
    @Query('format') _format: string = 'csv',
    @Res() res: Response,
  ) {
    resolveBranchId(user, branchId);
    this.logger.log(`Exporting purchase report from ${from} to ${to}`);

    const csv = 'Supplier,Purchase Count,Total Amount\n';

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=purchase-report-${from}-${to}.csv`,
    );
    return res.send(csv);
  }

  /**
   * GET /reports/hq-summary
   * Get aggregated HQ dashboard data across all branches.
   * Replaces N×3 per-branch API calls with a single efficient query.
   */
  @Get('hq-summary')
  @Roles(UserRole.SUPER_ADMIN)
  async getHQDashboardSummary(@CurrentUser() user: CurrentUserData) {
    this.logger.log(`HQ dashboard summary requested by user: ${user.userId}`);
    return this.reportsService.getHQDashboardSummary();
  }
}
