import {
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Body,
  Query,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SendReceiptDto } from './dto/send-receipt.dto';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto.js';
import { EmailLogFilterDto } from './dto/email-log-filter.dto.js';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Sale, SaleDocument } from '../sales/schemas/sale.schema';
import { BranchDocument } from '../branches/schemas/branch.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../users/schemas/user.schema.js';
import { ReceiptData, ReceiptItem } from './interfaces/email.interface';

/**
 * Email Controller
 * Handles email-related endpoints
 * Requirements: 4.1, 4.2, 4.3
 */
@ApiTags('Email')
@Controller('email')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    @InjectModel(Sale.name) private readonly saleModel: Model<SaleDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  @Get('templates')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER)
  async getTemplates() {
    return this.emailService.getTemplates();
  }

  @Post('templates')
  @Roles(UserRole.SUPER_ADMIN)
  async createTemplate(@Body() dto: CreateEmailTemplateDto) {
    return this.emailService.createTemplate(dto);
  }

  @Patch('templates/:id')
  @Roles(UserRole.SUPER_ADMIN)
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.emailService.updateTemplate(id, dto);
  }

  @Patch('templates/:id/toggle-status')
  @Roles(UserRole.SUPER_ADMIN)
  async toggleTemplateStatus(@Param('id') id: string) {
    return this.emailService.toggleTemplateStatus(id);
  }

  @Get('logs')
  @Roles(UserRole.SUPER_ADMIN, UserRole.BRANCH_MANAGER, UserRole.AUDITOR)
  async getLogs(@Query() filter: EmailLogFilterDto) {
    return this.emailService.getLogs(filter);
  }

  /**
   * Send receipt email to customer
   * POST /email/receipt
   * Requirements: 4.2, 4.3
   */
  @Post('receipt')
  @Roles(
    UserRole.SUPER_ADMIN,
    UserRole.BRANCH_MANAGER,
    UserRole.CASHIER,
    UserRole.AUDITOR,
  )
  async sendReceipt(@Body() dto: SendReceiptDto): Promise<{ message: string }> {
    // Fetch sale with populated references
    const sale = await this.saleModel
      .findById(dto.saleId)
      .populate('branchId')
      .populate('cashierId')
      .exec();

    if (!sale) {
      throw new NotFoundException(`Sale with ID ${dto.saleId} not found`);
    }

    // Fetch product details for all items
    const productIds = sale.items.map((item) => item.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .exec();

    // Create a map for quick product lookup
    const productMap = new Map(products.map((p) => [p._id.toString(), p.name]));

    // Build receipt items with product names
    const receiptItems: ReceiptItem[] = sale.items.map((item) => ({
      name: productMap.get(item.productId.toString()) || 'Unknown Product',
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.subtotal,
    }));

    // Build receipt data
    const branch = sale.branchId as unknown as BranchDocument;
    const cashier = sale.cashierId as unknown as UserDocument;

    const receiptData: ReceiptData = {
      receiptNumber: sale.receiptNumber,
      items: receiptItems,
      subtotal: sale.subtotal,
      discount: sale.discount,
      total: sale.total,
      paymentMethod: sale.paymentMethod,
      timestamp: sale.createdAt || new Date(),
      branchName: branch.name,
      branchAddress: branch.address,
      cashierName: `${cashier.firstName} ${cashier.lastName}`,
      customerName: sale.customerName,
      customerPhone: sale.customerPhone,
    };

    // Send email
    await this.emailService.sendReceipt({
      to: dto.email,
      receiptData,
    });

    return {
      message: `Receipt sent successfully to ${dto.email}`,
    };
  }
}
