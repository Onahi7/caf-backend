import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ProformaInvoicesRepository } from './proforma-invoices.repository.js';
import {
  ProformaInvoice, ProformaInvoiceDocument,
  ProformaStatus, PaymentStatus, PaymentMethod,
} from './schemas/proforma-invoice.schema.js';
import { CreateProformaDto, RecordPaymentDto, ConvertToSaleDto } from './dto/proforma.dto.js';
import { PdfGeneratorService } from '../common/services/pdf-generator.service.js';

@Injectable()
export class ProformaInvoicesService {
  private readonly logger = new Logger(ProformaInvoicesService.name);

  constructor(
    private readonly repository: ProformaInvoicesRepository,
    private readonly pdfGenerator: PdfGeneratorService,
    @InjectModel(ProformaInvoice.name) private readonly model: Model<ProformaInvoiceDocument>,
  ) {}

  async create(dto: CreateProformaDto, userId: string, branchId: string): Promise<ProformaInvoiceDocument> {
    const proformaNumber = await this.repository.generateProformaNumber(branchId);

    const items = dto.items.map((item) => ({
      productId: new Types.ObjectId(item.productId),
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      total: item.quantity * item.unitPrice,
    }));

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);
    const taxRate = dto.taxRate ?? 0;
    const taxAmount = subtotal * taxRate;
    const total = subtotal + taxAmount;

    return this.repository.create({
      proformaNumber,
      customerOrderId: dto.customerOrderId ? new Types.ObjectId(dto.customerOrderId) : undefined,
      customerId: new Types.ObjectId(dto.customerId),
      branchId: new Types.ObjectId(branchId),
      items: items as any,
      subtotal,
      taxRate,
      taxAmount,
      total,
      validUntil: new Date(dto.validUntil),
      status: ProformaStatus.DRAFT,
      paymentStatus: PaymentStatus.UNPAID,
      notes: dto.notes,
      terms: dto.terms,
      createdBy: new Types.ObjectId(userId),
    });
  }

  async findById(id: string): Promise<ProformaInvoiceDocument> {
    const pf = await this.repository.findById(id);
    if (!pf) throw new BadRequestException(`Proforma invoice ${id} not found`);
    return pf;
  }

  async findAll(filter: { branchId?: string; status?: string; customerId?: string }): Promise<ProformaInvoiceDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.status) query.status = filter.status;
    if (filter.customerId) query.customerId = new Types.ObjectId(filter.customerId);
    return this.repository.findAll(query);
  }

  async submitForApproval(id: string): Promise<ProformaInvoiceDocument> {
    const pf = await this.findById(id);
    if (pf.status !== ProformaStatus.DRAFT) {
      throw new BadRequestException(`Cannot submit proforma in status ${pf.status}`);
    }
    pf.status = ProformaStatus.PENDING_APPROVAL;
    return pf.save();
  }

  async approve(id: string, userId: string): Promise<ProformaInvoiceDocument> {
    const pf = await this.findById(id);
    if (pf.status !== ProformaStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot approve proforma in status ${pf.status}`);
    }
    pf.status = ProformaStatus.APPROVED;
    pf.approvedBy = new Types.ObjectId(userId);
    pf.approvedAt = new Date();
    return pf.save();
  }

  async reject(id: string, reason: string): Promise<ProformaInvoiceDocument> {
    const pf = await this.findById(id);
    if (pf.status !== ProformaStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Cannot reject proforma in status ${pf.status}`);
    }
    pf.status = ProformaStatus.REJECTED;
    pf.rejectedReason = reason;
    return pf.save();
  }

  async recordPayment(id: string, dto: RecordPaymentDto, userId: string): Promise<ProformaInvoiceDocument> {
    const pf = await this.findById(id);
    if (pf.status !== ProformaStatus.APPROVED && pf.status !== ProformaStatus.CONVERTED) {
      throw new BadRequestException('Payments can only be recorded on approved proformas');
    }

    const paymentEntry = {
      amount: dto.amount,
      method: dto.method as any,
      reference: dto.reference,
      paidAt: new Date(),
      receivedBy: new Types.ObjectId(userId),
    };

    const totalPaid =
      pf.payments.reduce((sum, p) => sum + p.amount, 0) + dto.amount;

    pf.payments.push(paymentEntry as any);
    pf.paymentStatus =
      totalPaid >= pf.total ? PaymentStatus.PAID :
      totalPaid > 0 ? PaymentStatus.PARTIAL :
      PaymentStatus.UNPAID;

    return pf.save();
  }

  async convertToSale(
    id: string,
    dto: ConvertToSaleDto,
    userId: string,
  ): Promise<{ proforma: ProformaInvoiceDocument; saleId: string }> {
    const pf = await this.findById(id);
    if (pf.status !== ProformaStatus.APPROVED) {
      throw new BadRequestException('Only approved proformas can be converted to sales');
    }

    // Build sale items from proforma items
    const saleItems = pf.items.map((item) => ({
      productId: item.productId.toString(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      quantityInBaseUnits: item.quantity,
    }));

    // Create sale via the Sales module
    const SalesModule = this.model.db.model('Sale');
    const ProductModel = this.model.db.model('Product');
    const shift = await this.model.db.model('Shift').findOne({
      branchId: pf.branchId,
      status: 'open',
    }).exec();

    if (!shift) {
      throw new BadRequestException('No open shift found. Please open a shift first.');
    }

    // Deduct stock for each item
    for (const item of pf.items) {
      await ProductModel.updateOne(
        { _id: item.productId, branchId: pf.branchId },
        { $inc: { quantityAvailable: -item.quantity } },
      ).exec();
    }

    const sale = await SalesModule.create({
      branchId: pf.branchId,
      shiftId: shift._id,
      terminalId: 'ORDER-MGMT',
      cashierId: new Types.ObjectId(userId),
      items: saleItems.map((si: any) => ({
        productId: new Types.ObjectId(si.productId),
        quantity: si.quantity,
        unitPrice: si.unitPrice,
        subtotal: si.quantity * si.unitPrice,
      })),
      subtotal: pf.subtotal,
      discount: 0,
      total: pf.total,
      saleType: 'cash',
      paymentMethod: dto.paymentMethod === PaymentMethod.CREDIT ? 'credit' : 'cash',
      paymentStatus: dto.paymentMethod === PaymentMethod.CREDIT ? 'unpaid' : 'paid',
      amountPaid: dto.amountPaid ?? pf.total,
      balanceDue: dto.paymentMethod === PaymentMethod.CREDIT ? pf.total - (dto.amountPaid ?? 0) : 0,
      receiptNumber: `SALE-${Date.now()}`,
      customerName: pf.customerId ? undefined : undefined,
      status: 'completed',
    });

    pf.saleId = sale._id;
    pf.status = ProformaStatus.CONVERTED;
    await pf.save();

    this.logger.log(`Proforma ${pf.proformaNumber} converted to sale ${sale._id}`);

    return { proforma: pf, saleId: sale._id.toString() };
  }

  async generatePdf(id: string): Promise<Buffer> {
    const pf = await this.findById(id);
    const customer = (pf as any).customerId;

    return this.pdfGenerator.generateProformaPdf({
      proformaNumber: pf.proformaNumber,
      customerName: customer?.firstName && customer?.lastName
        ? `${customer.firstName} ${customer.lastName}`
        : 'Customer',
      customerAddress: customer?.address,
      customerPhone: customer?.phone,
      date: pf.createdAt?.toLocaleDateString() || new Date().toLocaleDateString(),
      validUntil: pf.validUntil.toLocaleDateString(),
      items: pf.items.map((i) => ({
        name: i.productName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        total: i.total,
      })),
      subtotal: pf.subtotal,
      taxRate: pf.taxRate,
      taxAmount: pf.taxAmount,
      total: pf.total,
      notes: pf.notes,
    });
  }
}
