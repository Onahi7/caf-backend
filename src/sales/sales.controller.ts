import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { resolveBranchId } from '../common/utils/branch-scope.util.js';
import { SalesService } from './sales.service.js';
import { CheckoutService } from './checkout.service.js';
import { ReceiptService } from './receipt.service.js';
import { SaleDocument } from './schemas/sale.schema.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { ProcessReturnDto } from './dto/process-return.dto.js';
import { ReceiveSalePaymentDto } from './dto/receive-sale-payment.dto.js';
import { VerifyPrescriptionDto } from './dto/verify-prescription.dto.js';
import { CheckStockDto } from './dto/check-stock.dto.js';
import { SaleFilterDto } from './dto/sale-filter.dto.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { getPaymentMethodLabel } from '../common/constants/payment-methods.constant.js';
import { IdempotencyGuard } from '../common/guards/idempotency.guard.js';
import { IdempotencyInterceptor } from '../common/interceptors/idempotency.interceptor.js';
import { EmailService } from '../email/email.service.js';
import { ReceiptData, ReceiptItem } from '../email/interfaces/email.interface.js';

/**
 * SalesController
 * REST API endpoints for POS operations
 * Requirements: 6.3, 6.4, 11.1, 11.4, 1.4, 2.7, 5.5, 6.1, 6.3
 */
@ApiTags('Sales')
@Controller('sales')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly checkoutService: CheckoutService,
    private readonly receiptService: ReceiptService,
    private readonly emailService: EmailService,
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  /**
   * Helper method to format sale data with currency and payment method labels
   * Requirements: 1.4
   */
  private async formatSaleData(
    sale: SaleDocument,
    currencyCode?: string,
  ): Promise<Record<string, unknown>> {
    const code =
      currencyCode ?? (await this.getBranchCurrencyCode(sale.branchId.toString()));
    return {
      ...sale.toObject(),
      totalFormatted: CurrencyUtil.format(sale.total, code),
      subtotalFormatted: CurrencyUtil.format(sale.subtotal, code),
      discountFormatted: CurrencyUtil.format(sale.discount, code),
      returnedAmountFormatted: CurrencyUtil.format(sale.returnedAmount, code),
      paymentMethodLabel: getPaymentMethodLabel(sale.paymentMethod),
      amountPaidFormatted: CurrencyUtil.format(sale.amountPaid ?? 0, code),
      balanceDueFormatted: CurrencyUtil.format(sale.balanceDue ?? 0, code),
    };
  }

  /**
   * Fetch the currency code for a branch
   */
  private async getBranchCurrencyCode(branchId: string): Promise<string> {
    if (!branchId) {
      return 'SLE';
    }
    const branch = await this.branchModel.findById(branchId).exec();
    return branch?.currencyCode || 'SLE';
  }

  /**
   * POST /sales/checkout
   * Process a new sale checkout
   * Requirements: 6.3, 6.4, 2.7, 5.5, 6.1, 6.3
   * Property 6: Payment method persistence
   * Property 7: Payment method validation
   * Property 13: Mobile money reference storage
   * Property 15: Optional mobile money reference
   */
  @Post('checkout')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.CREATED)
  async checkout(
    @Body() createSaleDto: CreateSaleDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.checkoutService.processCheckout(
      createSaleDto,
      user.userId,
    );
    const currencyCode = await this.getBranchCurrencyCode(
      result.sale.branchId.toString(),
    );

    return {
      success: true,
      message: 'Checkout completed successfully',
      data: {
        saleId: result.sale._id,
        receiptNumber: result.receiptNumber,
        total: result.totalAmount,
        totalFormatted: CurrencyUtil.format(result.totalAmount, currencyCode),
        subtotal: result.sale.subtotal,
        subtotalFormatted: CurrencyUtil.format(
          result.sale.subtotal,
          currencyCode,
        ),
        discount: result.sale.discount,
        discountFormatted: CurrencyUtil.format(
          result.sale.discount,
          currencyCode,
        ),
        paymentMethod: result.sale.paymentMethod,
        paymentMethodLabel: getPaymentMethodLabel(result.sale.paymentMethod),
        paymentReference: result.sale.paymentReference,
        itemsProcessed: result.itemsProcessed,
      },
    };
  }

  /**
   * POST /sales/:id/return
   * Process a return for a sale
   * Requirements: 11.1, 11.4, 1.4
   */
  @Post(':id/return')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async processReturn(
    @Param('id') saleId: string,
    @Body() processReturnDto: Omit<ProcessReturnDto, 'saleId'>,
    @CurrentUser() user: CurrentUserData,
  ) {
    const result = await this.salesService.processReturn(
      { ...processReturnDto, saleId },
      user.userId,
    );
    const currencyCode = await this.getBranchCurrencyCode(
      result.sale.branchId.toString(),
    );

    return {
      success: true,
      message: 'Return processed successfully',
      data: {
        saleId: result.sale._id,
        receiptNumber: result.sale.receiptNumber,
        returnedItems: result.returnedItems,
        returnedAmount: result.returnedAmount,
        returnedAmountFormatted: CurrencyUtil.format(
          result.returnedAmount,
          currencyCode,
        ),
        total: result.sale.total,
        totalFormatted: CurrencyUtil.format(result.sale.total, currencyCode),
        newStatus: result.newStatus,
        paymentMethod: result.sale.paymentMethod,
        paymentMethodLabel: getPaymentMethodLabel(result.sale.paymentMethod),
      },
    };
  }

  @Post(':id/payments')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.FINANCE_MANAGER,
  )
  @UseGuards(IdempotencyGuard)
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  async recordPayment(
    @Param('id') saleId: string,
    @Body() receivePaymentDto: ReceiveSalePaymentDto,
    @CurrentUser() user: CurrentUserData,
  ) {
    const sale = await this.salesService.recordPayment(
      saleId,
      receivePaymentDto,
      user,
    );

    return {
      success: true,
      message: 'Payment recorded successfully',
      data: await this.formatSaleData(sale),
    };
  }

  /**
   * POST /sales/:id/email
   * Legacy compatibility endpoint to email a receipt for a sale
   */
  @Post(':id/email')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  @HttpCode(HttpStatus.OK)
  async emailReceipt(@Param('id') saleId: string, @Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }

    const sale = await this.salesService.findById(saleId);
    await sale.populate(['branchId', 'cashierId', 'items.productId']);

    const branch = sale.branchId as unknown as {
      name?: string;
      address?: string;
      phone?: string;
      currencyCode?: string;
    };

    const cashier = sale.cashierId as unknown as {
      username?: string;
      firstName?: string;
      lastName?: string;
    };

    const receiptItems: ReceiptItem[] = sale.items.map((item) => {
      const product = item.productId as unknown as { name?: string };

      return {
        name: product?.name || 'Unknown Product',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.subtotal,
      };
    });

    const cashierName =
      cashier.username ||
      [cashier.firstName, cashier.lastName].filter(Boolean).join(' ') ||
      'Unknown Cashier';

    const receiptData: ReceiptData = {
      receiptNumber: sale.receiptNumber,
      timestamp: sale.createdAt || new Date(),
      branchName: branch?.name || 'Pharmacy',
      branchAddress: branch?.address,
      branchCurrencyCode: branch?.currencyCode,
      cashierName,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
      items: receiptItems,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
    };

    await this.emailService.sendReceipt({
      to: email,
      receiptData,
    });

    return {
      success: true,
      message: 'Receipt sent successfully',
    };
  }

  /**
   * GET /sales
   * Get sales with filtering
   * Requirements: 1.4
   */
  @Get()
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findAll(
    @CurrentUser() user: CurrentUserData,
    @Query() filter: SaleFilterDto,
  ) {
    const resolvedBranchId = resolveBranchId(user, filter.branchId);
    if (resolvedBranchId) {
      filter.branchId = resolvedBranchId;
    } else {
      delete filter.branchId;
    }
    const sales = await this.salesService.findAll(filter);

    return {
      success: true,
      data: await Promise.all(
        sales.map((sale) => this.formatSaleData(sale)),
      ),
      count: sales.length,
    };
  }

  /**
   * GET /sales/receipt/:receiptNumber
   * Get a sale by receipt number
   * Requirements: 1.4
   */
  @Get('receipt/:receiptNumber')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByReceiptNumber(@Param('receiptNumber') receiptNumber: string) {
    const sale = await this.salesService.findByReceiptNumber(receiptNumber);

    return {
      success: true,
      data: await this.formatSaleData(sale),
    };
  }

  /**
   * GET /sales/shift/:shiftId
   * Get all sales for a specific shift
   * Requirements: 1.4
   */
  @Get('shift/:shiftId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findByShift(@Param('shiftId') shiftId: string) {
    const sales = await this.salesService.findByShift(shiftId);

    return {
      success: true,
      data: await Promise.all(
        sales.map((sale) => this.formatSaleData(sale)),
      ),
      count: sales.length,
    };
  }

  /**
   * GET /sales/branch/:branchId
   * Get all sales for a specific branch
   * Requirements: 1.4
   */
  @Get('branch/:branchId')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.AUDITOR,
  )
  async findByBranch(@Param('branchId') branchId: string) {
    const sales = await this.salesService.findByBranch(branchId);

    return {
      success: true,
      data: await Promise.all(
        sales.map((sale) => this.formatSaleData(sale)),
      ),
      count: sales.length,
    };
  }

  /**
   * POST /sales/:id/verify-prescription
   * Verify prescription for a sale
   * Requirements: 22.4
   */
  @Post(':id/verify-prescription')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  @HttpCode(HttpStatus.OK)
  async verifyPrescription(
    @Param('id') saleId: string,
    @Body() verifyDto: Omit<VerifyPrescriptionDto, 'saleId'>,
    @CurrentUser() user: CurrentUserData,
  ) {
    const sale = await this.salesService.verifyPrescription(
      { saleId, ...verifyDto },
      user.userId,
    );

    return {
      success: true,
      message: `Prescription ${verifyDto.status}`,
      data: {
        saleId: sale._id,
        receiptNumber: sale.receiptNumber,
        prescriptionStatus: sale.prescriptionStatus,
      },
    };
  }

  /**
   * GET /sales/pending-prescriptions
   * Get sales pending prescription verification
   * Requirements: 1.4
   */
  @Get('pending-prescriptions')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async getPendingPrescriptions(@Query('branchId') branchId?: string) {
    const sales =
      await this.salesService.getSalesPendingPrescriptionVerification(branchId);

    return {
      success: true,
      data: await Promise.all(
        sales.map((sale) => this.formatSaleData(sale)),
      ),
      count: sales.length,
    };
  }

  /**
   * GET /sales/:id
   * Get a specific sale by ID
   * Requirements: 1.4
   */
  @Get(':id')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async findById(@Param('id') id: string) {
    const sale = await this.salesService.findById(id);

    return {
      success: true,
      data: await this.formatSaleData(sale),
    };
  }

  /**
   * POST /sales/check-stock
   * Check stock availability for items before checkout
   */
  @Post('check-stock')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  @HttpCode(HttpStatus.OK)
  async checkStock(@Body() checkStockDto: CheckStockDto) {
    const result = await this.checkoutService.checkStockAvailability(
      checkStockDto.branchId,
      checkStockDto.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: 0, // Not needed for stock check
      })),
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * GET /sales/stats/:branchId
   * Get sales statistics for a branch
   * Requirements: 1.4
   */
  @Get('stats/:branchId')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getSalesStats(
    @Param('branchId') branchId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const stats = await this.salesService.getSalesStats(
      branchId,
      new Date(startDate),
      new Date(endDate),
    );
    const currencyCode = await this.getBranchCurrencyCode(branchId);

    return {
      success: true,
      data: {
        ...stats,
        totalAmountFormatted: CurrencyUtil.format(
          stats.totalAmount,
          currencyCode,
        ),
        averageTransactionFormatted: CurrencyUtil.format(
          stats.averageTransaction,
          currencyCode,
        ),
      },
    };
  }

  /**
   * GET /sales/shift/:shiftId/total
   * Get total sales amount for a shift
   * Requirements: 1.4
   */
  @Get('shift/:shiftId/total')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async getShiftTotal(@Param('shiftId') shiftId: string) {
    const total = await this.salesService.calculateShiftTotal(shiftId);
    let currencyCode = 'SLE';
    const shiftSales = await this.salesService.findByShift(shiftId);
    if (shiftSales && shiftSales.length > 0) {
      currencyCode = await this.getBranchCurrencyCode(
        shiftSales[0].branchId.toString(),
      );
    }

    return {
      success: true,
      data: {
        total,
        totalFormatted: CurrencyUtil.format(total, currencyCode),
      },
    };
  }

  /**
   * GET /sales/:id/receipt/pdf
   * Download receipt as PDF
   */
  @Get(':id/receipt/pdf')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async downloadPDFReceipt(
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const sale = await this.salesService.findById(id);
    const pdfStream = await this.receiptService.generatePDFReceipt(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="receipt-${sale.receiptNumber}.pdf"`,
    );

    pdfStream.pipe(res);
  }

  /**
   * GET /sales/:id/receipt/thermal
   * Get ESC/POS commands for thermal printer
   * Query params: width (58 or 80, default 80)
   */
  @Get(':id/receipt/thermal')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
  )
  async getThermalReceipt(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('width') width?: string,
  ): Promise<void> {
    const printerWidth = width === '58' ? 58 : 80;
    const commands = await this.receiptService.generateThermalReceipt(
      id,
      printerWidth,
    );

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="receipt.bin"',
    );

    res.send(commands);
  }
}
