import { Injectable, NotFoundException } from '@nestjs/common';
import { SalesRepository } from './sales.repository.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

/**
 * Receipt Service
 * Handles receipt generation in multiple formats
 * - PDF for digital/printing
 - ESC/POS commands for thermal printers
 */
@Injectable()
export class ReceiptService {
  constructor(private readonly salesRepository: SalesRepository) {}

  /**
   * Generate PDF receipt
   * Returns a readable stream for download or printing
   */
  async generatePDFReceipt(saleId: string): Promise<Readable> {
    const sale = await this.salesRepository.findById(saleId);
    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    // Populate references if needed
    await sale.populate(['branchId', 'cashierId', 'items.productId']);

    return this.createPDFDocument(sale);
  }

  /**
   * Generate ESC/POS commands for thermal printers (58mm/80mm)
   * Returns raw printer commands as Buffer
   */
  async generateThermalReceipt(saleId: string, width: 58 | 80 = 80): Promise<Buffer> {
    const sale = await this.salesRepository.findById(saleId);
    if (!sale) {
      throw new NotFoundException(`Sale with ID ${saleId} not found`);
    }

    await sale.populate(['branchId', 'cashierId', 'items.productId']);

    return this.createESCPOSCommands(sale, width);
  }

  /**
   * Create PDF document with receipt content
   */
  private createPDFDocument(sale: any): Readable {
    const doc = new PDFDocument({ size: 'A5', margin: 50 });

    // Store branch info
    const branchName = sale.branchId?.name || 'Pharmacy POS';
    const branchAddress = sale.branchId?.address || '';
    const branchPhone = sale.branchId?.phone || '';

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text(branchName, { align: 'center' });
    
    if (branchAddress) {
      doc.fontSize(10).font('Helvetica').text(branchAddress, { align: 'center' });
    }
    
    if (branchPhone) {
      doc.fontSize(10).text(`Tel: ${branchPhone}`, { align: 'center' });
    }

    doc.moveDown();
    doc.fontSize(16).font('Helvetica-Bold').text('SALES RECEIPT', { align: 'center' });
    doc.moveDown();

    // Receipt details
    doc.fontSize(10).font('Helvetica');
    doc.text(`Receipt No: ${sale.receiptNumber}`);
    doc.text(`Date: ${new Date(sale.createdAt).toLocaleString('en-SL', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    })}`);
    doc.text(`Cashier: ${sale.cashierId?.username || 'N/A'}`);
    
    if (sale.customerName) {
      doc.text(`Customer: ${sale.customerName}`);
    }
    
    doc.moveDown();

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Items header
    doc.font('Helvetica-Bold');
    const headerY = doc.y;
    doc.text('Item', 50, headerY, { width: 200, continued: false });
    doc.text('Qty', 250, headerY, { width: 60, align: 'right', continued: false });
    doc.text('Price', 310, headerY, { width: 80, align: 'right', continued: false });
    doc.text('Total', 390, headerY, { width: 100, align: 'right', continued: false });
    doc.moveDown(0.5);

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica');
    for (const item of sale.items) {
      const productName = item.productId?.name || 'Unknown Product';
      const itemY = doc.y;
      
      doc.text(productName, 50, itemY, { width: 200, continued: false });
      doc.text(item.quantity.toString(), 250, itemY, { width: 60, align: 'right', continued: false });
      doc.text(CurrencyUtil.formatWithoutSymbol(item.unitPrice), 310, itemY, { width: 80, align: 'right', continued: false });
      doc.text(CurrencyUtil.formatWithoutSymbol(item.subtotal), 390, itemY, { width: 100, align: 'right', continued: false });
      
      // Batch info (smaller font)
      if (item.lotNumber || item.expiryDate) {
        doc.moveDown(0.3);
        doc.fontSize(8).fillColor('gray');
        let batchInfo = '';
        if (item.lotNumber) batchInfo += `Lot: ${item.lotNumber}`;
        if (item.expiryDate) {
          if (batchInfo) batchInfo += ' | ';
          batchInfo += `Exp: ${new Date(item.expiryDate).toLocaleDateString('en-SL')}`;
        }
        doc.text(batchInfo, 50, doc.y, { width: 200 });
        doc.fontSize(10).fillColor('black');
      }
      
      doc.moveDown(0.5);
    }

    // Line separator
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica');
    const totalsX = 350;
    const totalsValueX = 450;
    
    doc.text('Subtotal:', totalsX, doc.y, { width: 100, continued: false });
    doc.text(CurrencyUtil.format(sale.subtotal), totalsValueX, doc.y, { width: 100, align: 'right' });
    doc.moveDown(0.3);

    if (sale.discount > 0) {
      doc.text('Discount:', totalsX, doc.y, { width: 100, continued: false });
      doc.text(`-${CurrencyUtil.format(sale.discount)}`, totalsValueX, doc.y, { width: 100, align: 'right' });
      doc.moveDown(0.3);
    }

    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('TOTAL:', totalsX, doc.y, { width: 100, continued: false });
    doc.text(CurrencyUtil.format(sale.total), totalsValueX, doc.y, { width: 100, align: 'right' });
    doc.moveDown();

    // Payment info
    doc.fontSize(10).font('Helvetica');
    doc.text(`Payment Method: ${this.formatPaymentMethod(sale.paymentMethod)}`, 50);
    
    if (sale.paymentReference) {
      doc.text(`Reference: ${sale.paymentReference}`, 50);
    }

    doc.moveDown();

    // Return policy
    if (sale.status === 'completed') {
      doc.fontSize(8).fillColor('gray');
      doc.text('Return Policy: Items may be returned within 7 days with receipt.', { align: 'center' });
      doc.text('Prescription drugs are non-returnable once dispensed.', { align: 'center' });
    }

    doc.moveDown();

    // Footer
    doc.fontSize(10).fillColor('black').font('Helvetica-Bold');
    doc.text('Thank you for your purchase!', { align: 'center' });
    doc.fontSize(8).font('Helvetica');
    doc.text('Stay healthy!', { align: 'center' });

    doc.end();

    return doc as unknown as Readable;
  }

  /**
   * Create ESC/POS commands for thermal printers
   * Supports 58mm and 80mm paper widths
   */
  private createESCPOSCommands(sale: any, width: 58 | 80): Buffer {
    const commands: Buffer[] = [];
    
    // ESC/POS command constants
    const ESC = 0x1B;
    const GS = 0x1D;
    const LF = 0x0A;
    
    const CMD_INIT = Buffer.from([ESC, 0x40]); // Initialize printer
    const CMD_CENTER = Buffer.from([ESC, 0x61, 0x01]); // Center align
    const CMD_LEFT = Buffer.from([ESC, 0x61, 0x00]); // Left align
    const CMD_BOLD_ON = Buffer.from([ESC, 0x45, 0x01]); // Bold on
    const CMD_BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]); // Bold off
    const CMD_DOUBLE_HEIGHT = Buffer.from([GS, 0x21, 0x11]); // Double height
    const CMD_NORMAL = Buffer.from([GS, 0x21, 0x00]); // Normal size
    const CMD_CUT = Buffer.from([GS, 0x56, 0x00]); // Cut paper
    
    const lineWidth = width === 58 ? 32 : 48;
    const separator = '-'.repeat(lineWidth);

    // Helper to add text
    const addText = (text: string, newline = true) => {
      commands.push(Buffer.from(text));
      if (newline) commands.push(Buffer.from([LF]));
    };

    // Initialize
    commands.push(CMD_INIT);

    // Header
    commands.push(CMD_CENTER, CMD_BOLD_ON, CMD_DOUBLE_HEIGHT);
    addText(sale.branchId?.name || 'Pharmacy POS');
    commands.push(CMD_NORMAL, CMD_BOLD_OFF);
    
    if (sale.branchId?.address) addText(sale.branchId.address);
    if (sale.branchId?.phone) addText(`Tel: ${sale.branchId.phone}`);
    
    addText('');
    commands.push(CMD_BOLD_ON);
    addText('SALES RECEIPT');
    commands.push(CMD_BOLD_OFF);
    addText('');

    // Receipt details
    commands.push(CMD_LEFT);
    addText(`Receipt: ${sale.receiptNumber}`);
    addText(`Date: ${new Date(sale.createdAt).toLocaleString('en-SL', { 
      dateStyle: 'short', 
      timeStyle: 'short' 
    })}`);
    addText(`Cashier: ${sale.cashierId?.username || 'N/A'}`);
    
    if (sale.customerName) {
      addText(`Customer: ${sale.customerName}`);
    }
    
    addText(separator);

    // Items
    for (const item of sale.items) {
      const productName = item.productId?.name || 'Unknown';
      
      // Product name (may wrap)
      if (productName.length > lineWidth) {
        const words = productName.split(' ');
        let line = '';
        for (const word of words) {
          if ((line + word).length > lineWidth) {
            addText(line.trim());
            line = word + ' ';
          } else {
            line += word + ' ';
          }
        }
        if (line) addText(line.trim());
      } else {
        addText(productName);
      }
      
      // Quantity x Price = Total
      const qtyPriceTotal = `${item.quantity} x ${CurrencyUtil.formatWithoutSymbol(item.unitPrice)} = ${CurrencyUtil.format(item.subtotal)}`;
      addText(qtyPriceTotal);
      
      // Batch info
      if (item.lotNumber || item.expiryDate) {
        let batchInfo = '  ';
        if (item.lotNumber) batchInfo += `Lot: ${item.lotNumber}`;
        if (item.expiryDate) {
          if (item.lotNumber) batchInfo += ' | ';
          batchInfo += `Exp: ${new Date(item.expiryDate).toLocaleDateString('en-SL')}`;
        }
        addText(batchInfo);
      }
      
      addText('');
    }

    addText(separator);

    // Totals
    const subtotalLine = this.padLine('Subtotal:', CurrencyUtil.format(sale.subtotal), lineWidth);
    addText(subtotalLine);
    
    if (sale.discount > 0) {
      const discountLine = this.padLine('Discount:', `-${CurrencyUtil.format(sale.discount)}`, lineWidth);
      addText(discountLine);
    }
    
    commands.push(CMD_BOLD_ON, CMD_DOUBLE_HEIGHT);
    const totalLine = this.padLine('TOTAL:', CurrencyUtil.format(sale.total), lineWidth);
    addText(totalLine);
    commands.push(CMD_NORMAL, CMD_BOLD_OFF);

    addText('');
    addText(`Payment: ${this.formatPaymentMethod(sale.paymentMethod)}`);
    
    if (sale.paymentReference) {
      addText(`Ref: ${sale.paymentReference}`);
    }

    addText(separator);

    // Footer
    commands.push(CMD_CENTER);
    addText('Thank you for your purchase!');
    addText('Stay healthy!');
    addText('');
    addText('');

    // Cut paper
    commands.push(CMD_CUT);

    return Buffer.concat(commands);
  }

  /**
   * Pad a line with spaces between left and right text
   */
  private padLine(left: string, right: string, width: number): string {
    const padding = width - left.length - right.length;
    if (padding < 1) {
      return left + ' ' + right;
    }
    return left + ' '.repeat(padding) + right;
  }

  /**
   * Format payment method for display
   */
  private formatPaymentMethod(method: string): string {
    const methods: Record<string, string> = {
      cash: 'Cash',
      card: 'Card',
      orange_money: 'Orange Money',
      africell_money: 'Africell Money',
      qmoney: 'QMoney',
      bank_transfer: 'Bank Transfer',
      mobile: 'Mobile Money',
      insurance: 'Insurance',
      split: 'Split Payment'
    };
    
    return methods[method] || method;
  }
}
