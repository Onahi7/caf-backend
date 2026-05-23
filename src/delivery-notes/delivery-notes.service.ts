import { Injectable, BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DeliveryNotesRepository } from './delivery-notes.repository.js';
import {
  DeliveryNoteDocument, DeliveryStatus,
} from './schemas/delivery-note.schema.js';
import { CreateDeliveryNoteDto, MarkDeliveredDto } from './dto/delivery-note.dto.js';
import { PdfGeneratorService } from '../common/services/pdf-generator.service.js';

@Injectable()
export class DeliveryNotesService {
  constructor(
    private readonly repository: DeliveryNotesRepository,
    private readonly pdfGenerator: PdfGeneratorService,
  ) {}

  async create(dto: CreateDeliveryNoteDto, _userId: string): Promise<DeliveryNoteDocument> {
    const deliveryNumber = await this.repository.generateDeliveryNumber(dto.branchId);

    return this.repository.create({
      deliveryNumber,
      proformaInvoiceId: new Types.ObjectId(dto.proformaInvoiceId),
      customerId: new Types.ObjectId(dto.customerId),
      branchId: new Types.ObjectId(dto.branchId),
      items: dto.items.map((item) => ({
        productId: new Types.ObjectId(item.productId),
        productName: item.productName,
        quantity: item.quantity,
      })) as any,
      status: DeliveryStatus.PENDING,
      notes: dto.notes,
    });
  }

  async findById(id: string): Promise<DeliveryNoteDocument> {
    const dn = await this.repository.findById(id);
    if (!dn) throw new BadRequestException(`Delivery note ${id} not found`);
    return dn;
  }

  async findAll(filter: { branchId?: string; proformaInvoiceId?: string; status?: string }): Promise<DeliveryNoteDocument[]> {
    const query: Record<string, any> = {};
    if (filter.branchId) query.branchId = new Types.ObjectId(filter.branchId);
    if (filter.proformaInvoiceId) query.proformaInvoiceId = new Types.ObjectId(filter.proformaInvoiceId);
    if (filter.status) query.status = filter.status;
    return this.repository.findAll(query);
  }

  async markDelivered(id: string, userId: string, dto?: MarkDeliveredDto): Promise<DeliveryNoteDocument> {
    const dn = await this.findById(id);
    if (dn.status === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('Delivery note is already marked as delivered');
    }
    dn.status = DeliveryStatus.DELIVERED;
    dn.deliveredAt = dto?.deliveredAt ? new Date(dto.deliveredAt) : new Date();
    dn.deliveredBy = new Types.ObjectId(userId);
    if (dto?.notes) dn.notes = dto.notes;
    return dn.save();
  }

  async generatePdf(id: string): Promise<Buffer> {
    const dn = await this.findById(id);
    const customer = (dn as any).customerId;

    return this.pdfGenerator.generateDeliveryNotePdf({
      deliveryNumber: dn.deliveryNumber,
      customerName: customer?.firstName && customer?.lastName
        ? `${customer.firstName} ${customer.lastName}`
        : 'Customer',
      customerAddress: customer?.address,
      date: dn.createdAt?.toLocaleDateString() || new Date().toLocaleDateString(),
      items: dn.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
      notes: dn.notes,
    });
  }
}
