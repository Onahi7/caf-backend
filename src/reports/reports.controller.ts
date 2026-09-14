import {
  Controller,
  Get,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
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
  ProfitLossReportDto,
  ExpenseReportDto,
  DeadStockReportDto,
} from './dto/index.js';

/**
 * ReportsController
 * Handles report generation and export endpoints
 * Requirements: 12.1, 13.1, 14.1, 14.2, 14.3
 */
@ApiTags('Reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(CacheInterceptor)
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
  @CacheTTL(30000)
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
  @CacheTTL(30000)
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR, UserRole.CASHIER)
  async getSalesReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: SalesReportDto,
    @Query('export') exportFormat: string,
    @Res() res: Response,
  ) {
    this.logger.log('Generating sales report');
    assignResolvedBranchId(user, dto);
    // Cashiers can only see their own sales
    if (user.role === UserRole.CASHIER) {
      dto.cashierId = user.userId;
    }

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
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR, UserRole.CASHIER)
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
  @CacheTTL(60000)
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
  @CacheTTL(120000)
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
    if (!itemsJson) {
      throw new BadRequestException('items query parameter is required (JSON array)');
    }
    this.logger.log(`Calculating COGS for sale ${saleId} requested by ${user.userId}`);

    let items: Array<{ productId: string; batchId: string; quantity: number }>;
    try {
      items = JSON.parse(itemsJson);
    } catch {
      throw new BadRequestException('items must be a valid JSON array');
    }
    return this.valuationService.calculateCOGS(saleId, items);
  }

  /**
   * GET /reports/customers
   * Generate customer analytics report
   */
  @Get('customers')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR, UserRole.CASHIER)
  async getCustomerReport(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    this.logger.log(`Generating customer report from ${from} to ${to}`);
    return this.reportsService.generateCustomerReport({
      branchId: resolvedBranchId,
      from,
      to,
      groupBy: _groupBy as 'day' | 'week' | 'month',
    });
  }

  /**
   * GET /reports/customers/export
   * Export customer report to PDF/Excel
   */
  @Get('customers/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR, UserRole.CASHIER)
  async exportCustomerReport(
    @CurrentUser() user: CurrentUserData,
    @Query('branchId') branchId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
    @Query('format') format: string = 'pdf',
    @Res() res: Response,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    this.logger.log(`Exporting customer report from ${from} to ${to}`);

    const report = await this.reportsService.generateCustomerReport({
      branchId: resolvedBranchId,
      from,
      to,
      groupBy: _groupBy as 'day' | 'week' | 'month',
    });

    const exportFormat = this.normalizeExportFormat(format);
    if (exportFormat === ExportFormat.EXCEL) {
      const buffer =
        await this.exportService.exportCustomerReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=customer-report-${Date.now()}.xlsx`,
      );
      return res.send(buffer);
    }

    const buffer = await this.exportService.exportCustomerReportToPDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=customer-report-${Date.now()}.pdf`,
    );
    return res.send(buffer);
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

    return this.reportsService.generatePurchaseReport({
      branchId: resolvedBranchId,
      from,
      to,
      groupBy: _groupBy as 'day' | 'week' | 'month',
    });
  }

  /**
   * GET /reports/purchases/export
   * Export purchase report to PDF/Excel
   */
  @Get('purchases/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportPurchaseReport(
    @CurrentUser() user: CurrentUserData,
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('groupBy') _groupBy: string = 'day',
    @Query('branchId') branchId: string,
    @Query('format') format: string = 'pdf',
    @Res() res: Response,
  ) {
    const resolvedBranchId = resolveBranchId(user, branchId);
    this.logger.log(`Exporting purchase report from ${from} to ${to}`);

    const report = await this.reportsService.generatePurchaseReport({
      branchId: resolvedBranchId,
      from,
      to,
      groupBy: _groupBy as 'day' | 'week' | 'month',
    });

    const exportFormat = this.normalizeExportFormat(format);
    if (exportFormat === ExportFormat.EXCEL) {
      const buffer =
        await this.exportService.exportPurchaseReportToExcel(report);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=purchase-report-${Date.now()}.xlsx`,
      );
      return res.send(buffer);
    }

    const buffer = await this.exportService.exportPurchaseReportToPDF(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=purchase-report-${Date.now()}.pdf`,
    );
    return res.send(buffer);
  }

  /**
   * GET /reports/profit-loss
   * Generate Profit & Loss report
   */
  @Get('profit-loss')
  @CacheTTL(120000)
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getProfitLossReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ProfitLossReportDto,
  ) {
    this.logger.log('Generating profit & loss report');
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateProfitLossReport(dto);
  }

  /**
   * GET /reports/profit-loss/export
   * Export P&L report
   */
  @Get('profit-loss/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportProfitLossReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ProfitLossReportDto,
    @Query('format') _format: string,
    @Res() res: Response,
  ) {
    assignResolvedBranchId(user, dto);
    const report = await this.reportsService.generateProfitLossReport(dto);
    const csv = [
      'Profit & Loss Report',
      `Period,${report.period.from} to ${report.period.to}`,
      '',
      'Revenue',
      `Total Sales,${report.revenue.totalSales}`,
      `Total Returns,${report.revenue.totalReturns}`,
      `Net Revenue,${report.revenue.netRevenue}`,
      '',
      'Cost of Goods Sold',
      `Total COGS,${report.costOfGoodsSold.totalCOGS}`,
      '',
      'Gross Profit',
      `Amount,${report.grossProfit.amount}`,
      `Margin,${report.grossProfit.margin}%`,
      '',
      'Expenses',
      `Total Expenses,${report.expenses.totalExpenses}`,
      ...report.expenses.byCategory.map(
        (cat) => `  ${cat.category},${cat.total}`,
      ),
      '',
      'Operating Profit',
      `Amount,${report.operatingProfit.amount}`,
      `Margin,${report.operatingProfit.margin}%`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=profit-loss-report-${Date.now()}.csv`,
    );
    return res.send(csv);
  }

  /**
   * GET /reports/expenses
   * Generate expense report
   */
  @Get('expenses')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getExpenseReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ExpenseReportDto,
  ) {
    this.logger.log('Generating expense report');
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateExpenseReport(dto);
  }

  /**
   * GET /reports/expenses/export
   * Export expense report
   */
  @Get('expenses/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportExpenseReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: ExpenseReportDto,
    @Query('format') _format: string,
    @Res() res: Response,
  ) {
    assignResolvedBranchId(user, dto);
    const report = await this.reportsService.generateExpenseReport(dto);

    const csvRows = report.byCategory.map((cat) =>
      [cat.category, cat.total, cat.count, `${cat.percentage}%`]
        .map((v) => JSON.stringify(v ?? ''))
        .join(','),
    );
    const csv = [
      'Category,Total,Count,Percentage',
      ...csvRows,
      '',
      `Total Expenses,${report.summary.totalExpenses}`,
      `Total Count,${report.summary.totalCount}`,
      `Average,${report.summary.averageExpense}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=expense-report-${Date.now()}.csv`,
    );
    return res.send(csv);
  }

  /**
   * GET /reports/dead-stock
   * Generate dead stock report
   */
  @Get('dead-stock')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getDeadStockReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: DeadStockReportDto,
  ) {
    this.logger.log('Generating dead stock report');
    assignResolvedBranchId(user, dto);
    return this.reportsService.generateDeadStockReport(dto);
  }

  /**
   * GET /reports/dead-stock/export
   * Export dead stock report
   */
  @Get('dead-stock/export')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async exportDeadStockReport(
    @CurrentUser() user: CurrentUserData,
    @Query() dto: DeadStockReportDto,
    @Query('format') _format: string,
    @Res() res: Response,
  ) {
    assignResolvedBranchId(user, dto);
    const report = await this.reportsService.generateDeadStockReport(dto);

    const csvRows = report.items.map((item) =>
      [
        item.productName,
        item.sku,
        item.branchName,
        item.quantityAvailable,
        item.costPrice,
        item.totalValue,
        item.daysSinceLastSale,
      ]
        .map((v) => JSON.stringify(v ?? ''))
        .join(','),
    );
    const csv = [
      'Product,SKU,Branch,Quantity,Cost Price,Total Value,Days Without Sale',
      ...csvRows,
      '',
      `Total Dead Stock Items,${report.summary.totalDeadStockItems}`,
      `Total Value,${report.summary.totalDeadStockValue}`,
      `Total Quantity,${report.summary.totalQuantity}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=dead-stock-report-${Date.now()}.csv`,
    );
    return res.send(csv);
  }

  /**
   * GET /reports/hq-summary
   * Get aggregated HQ dashboard data across all branches.
   * Replaces Nx3 per-branch API calls with a single efficient query.
   */
  @Get('hq-summary')
  @CacheTTL(120000)
  @Roles(UserRole.SUPER_ADMIN)
  async getHQDashboardSummary(@CurrentUser() user: CurrentUserData) {
    this.logger.log(`HQ dashboard summary requested by user: ${user.userId}`);
    return this.reportsService.getHQDashboardSummary();
  }
}
