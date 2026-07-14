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
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
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

    // Create sale via the Sales module
    const SalesModule = this.model.db.model('Sale');
    const ProductModel = this.model.db.model('Product');
    const BatchModel = this.model.db.model('Batch');
    const StockMovementModel = this.model.db.model('StockMovement');
    const productIds = pf.items.map((item) => item.productId);
    const isCreditSale = dto.paymentMethod === PaymentMethod.CREDIT;
    const amountPaid = dto.amountPaid ?? (isCreditSale ? 0 : pf.total);
    if (amountPaid < 0 || amountPaid > pf.total) {
      throw new BadRequestException('Amount paid must be between zero and the proforma total');
    }
    if (isCreditSale && amountPaid > 0) {
      throw new BadRequestException('Record a credit-sale deposit after conversion so its real payment method is captured');
    }

    let sale: any;
    const session = await this.model.db.startSession();
    try {
      await session.withTransaction(async () => {
        const shift = await this.model.db.model('Shift').findOne({
          branchId: pf.branchId,
          status: 'open',
        }).session(session).exec();

        if (!shift) {
          throw new BadRequestException('No open shift found. Please open a shift first.');
        }

        const products = await ProductModel.find({
          _id: { $in: productIds },
          branchId: pf.branchId,
          isActive: true,
        }).select('_id name quantityAvailable').lean().session(session).exec();
        const productsById = new Map(products.map((product: any) => [product._id.toString(), product]));

        for (const item of pf.items) {
          const product = productsById.get(item.productId.toString());
          if (!product) {
            throw new BadRequestException(`Product ${item.productName} is no longer available in this branch`);
          }
          if ((product.quantityAvailable ?? 0) < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for ${item.productName}. Available: ${product.quantityAvailable ?? 0}, requested: ${item.quantity}`,
            );
          }
        }

        const selectedSaleItems: Array<Record<string, unknown>> = [];
        for (const item of pf.items) {
          let remaining = item.quantity;
          const batches = await BatchModel.find({
            branchId: pf.branchId,
            productId: item.productId,
            quantityAvailable: { $gt: 0 },
            isExpired: false,
            isDepleted: false,
            expiryDate: { $gt: new Date() },
          }).sort({ expiryDate: 1 }).session(session).exec();
          for (const batch of batches) {
            if (remaining <= 0) break;
            const quantity = Math.min(remaining, batch.quantityAvailable);
            const updated = await BatchModel.findOneAndUpdate(
              { _id: batch._id, quantityAvailable: { $gte: quantity } },
              { $inc: { quantityAvailable: -quantity } },
              { new: true, session },
            ).exec();
            if (!updated) throw new BadRequestException('Batch stock changed while converting this proforma');
            if (updated.quantityAvailable === 0) {
              await BatchModel.updateOne({ _id: updated._id }, { $set: { isDepleted: true } }, { session }).exec();
            }
            selectedSaleItems.push({
              saleItemId: new Types.ObjectId().toString(),
              productId: item.productId,
              batchId: batch._id,
              quantity,
              unitPrice: item.unitPrice,
              subtotal: quantity * item.unitPrice,
              returnedQuantity: 0,
            });
            remaining -= quantity;
          }
          if (remaining > 0) {
            throw new BadRequestException(`Insufficient unexpired batch stock for ${item.productName}`);
          }
        }

        const stockUpdateResult = await ProductModel.bulkWrite(
          pf.items.map((item) => ({
            updateOne: {
              filter: {
                _id: item.productId,
                branchId: pf.branchId,
                quantityAvailable: { $gte: item.quantity },
              },
              update: { $inc: { quantityAvailable: -item.quantity } },
            },
          })),
          { session },
        );
        if (stockUpdateResult.modifiedCount !== pf.items.length) {
          throw new BadRequestException('Stock changed while converting this proforma. Please refresh and try again.');
        }

        [sale] = await SalesModule.create([{
          branchId: pf.branchId,
          shiftId: shift._id,
          terminalId: 'ORDER-MGMT',
          cashierId: new Types.ObjectId(userId),
          items: selectedSaleItems,
          subtotal: pf.subtotal,
          discount: 0,
          manualDiscount: 0,
          taxAmount: pf.taxAmount,
          total: pf.total,
          saleType: isCreditSale ? 'credit' : 'cash',
          paymentMethod: dto.paymentMethod,
          paymentStatus: amountPaid >= pf.total ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
          amountPaid,
          balanceDue: Math.max(pf.total - amountPaid, 0),
          payments: amountPaid > 0
            ? [{
                amount: amountPaid,
                paymentMethod: isCreditSale ? 'cash' : dto.paymentMethod,
                receivedBy: new Types.ObjectId(userId),
                receivedAt: new Date(),
                isInitialPayment: true,
              }]
            : [],
          receiptNumber: `SALE-${Date.now()}`,
          customerName: pf.customerId ? undefined : undefined,
          status: 'completed',
        }], { session });

        await StockMovementModel.create(
          selectedSaleItems.map((item) => ({
            branchId: pf.branchId,
            productId: item.productId,
            batchId: item.batchId,
            quantity: -Number(item.quantity),
            movementType: 'sale',
            reason: `Proforma ${pf.proformaNumber} converted to sale`,
            userId: new Types.ObjectId(userId),
            referenceId: sale._id,
            referenceType: 'Sale',
            timestamp: new Date(),
          })),
          { session },
        );

        pf.saleId = sale._id;
        pf.status = ProformaStatus.CONVERTED;
        await pf.save({ session });
      });
    } finally {
      await session.endSession();
    }

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
