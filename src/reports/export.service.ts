import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import {
  SalesReportResult,
  InventoryReportResult,
  ExpiryReportResult,
  TransferReportResult,
} from './dto/index.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';

/**
 * Export format enum
 */
export enum ExportFormat {
  PDF = 'pdf',
  EXCEL = 'excel',
}

/**
 * ExportService
 * Handles report export to PDF and Excel formats
 * Requirements: 14.5
 * Property 60: Report export formats
 */
@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectModel(Branch.name) private readonly branchModel: Model<BranchDocument>,
  ) {}

  /**
   * Build an Excel number format string for a currency code
   */
  private getCurrencyNumFmt(currencyCode: string): string {
    const symbol = currencyCode === 'USD' ? '$' : 'Le';
    return `"${symbol}"#,##0.00`;
  }

  /**
   * Resolve the currency code for a report result
   */
  private async getReportCurrencyCode(
    report: { branchId?: string; currencyCode?: string },
  ): Promise<string> {
    if (report.currencyCode) {
      return report.currencyCode;
    }
    if (report.branchId) {
      const branch = await this.branchModel.findById(report.branchId).exec();
      return branch?.currencyCode || 'SLE';
    }
    return 'SLE';
  }

  /**
   * Export sales report to PDF
   */
  async exportSalesReportToPDF(report: SalesReportResult): Promise<Buffer> {
    this.logger.log('Exporting sales report to PDF');
    const currencyCode = await this.getReportCurrencyCode(report);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Sales Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // Summary section
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Sales: ${report.summary.transactionCount}`);
      doc.text(
        `Total Amount: ${CurrencyUtil.format(report.summary.totalAmount, currencyCode)}`,
      );
      doc.text(
        `Total Discount: ${CurrencyUtil.format(report.summary.totalDiscount, currencyCode)}`,
      );
      doc.text(
        `Total Returns: ${CurrencyUtil.format(report.summary.totalReturns, currencyCode)}`,
      );
      doc.text(
        `Net Amount: ${CurrencyUtil.format(report.summary.netAmount, currencyCode)}`,
      );
      doc.text(
        `Average Transaction: ${CurrencyUtil.format(report.summary.averageTransaction, currencyCode)}`,
      );
      doc.moveDown(2);

      // Breakdown section
      if (report.breakdown && report.breakdown.length > 0) {
        doc.fontSize(14).text('Breakdown', { underline: true });
        doc.moveDown();
        doc.fontSize(10);

        const tableTop = doc.y;
        const col1X = 50;
        const col2X = 200;
        const col3X = 350;
        const col4X = 450;

        // Table headers
        doc.text('ID', col1X, tableTop);
        doc.text('Name', col2X, tableTop);
        doc.text('Amount', col3X, tableTop);
        doc.text('Count', col4X, tableTop);
        doc.moveDown();

        // Table rows
        report.breakdown.forEach((item) => {
          const y = doc.y;
          doc.text(item._id.substring(0, 8), col1X, y);
          doc.text(item.name || 'N/A', col2X, y);
          doc.text(
            CurrencyUtil.format(item.totalAmount, currencyCode),
            col3X,
            y,
          );
          doc.text(item.transactionCount.toString(), col4X, y);
          doc.moveDown();
        });
      }

      // Top products section
      if (report.topProducts && report.topProducts.length > 0) {
        doc.addPage();
        doc.fontSize(14).text('Top Products', { underline: true });
        doc.moveDown();
        doc.fontSize(10);

        report.topProducts.forEach((product, index) => {
          doc.text(
            `${index + 1}. Product ${product.productId.substring(0, 8)} - Qty: ${product.quantitySold}, Amount: ${CurrencyUtil.format(product.totalAmount, currencyCode)}`,
          );
          doc.moveDown(0.5);
        });
      }

      doc.end();
    });
  }

  /**
   * Export sales report to Excel
   */
  async exportSalesReportToExcel(report: SalesReportResult): Promise<Buffer> {
    this.logger.log('Exporting sales report to Excel');
    const currencyCode = await this.getReportCurrencyCode(report);
    const numFmt = this.getCurrencyNumFmt(currencyCode);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sales Report');

    // Add title
    worksheet.mergeCells('A1:D1');
    worksheet.getCell('A1').value = 'Sales Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Add generation date
    worksheet.mergeCells('A2:D2');
    worksheet.getCell('A2').value = `Generated: ${new Date().toLocaleString()}`;
    worksheet.getCell('A2').alignment = { horizontal: 'right' };

    // Add summary
    let row = 4;
    worksheet.getCell(`A${row}`).value = 'Summary';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;

    worksheet.getCell(`A${row}`).value = 'Total Sales';
    worksheet.getCell(`B${row}`).value = report.summary.transactionCount;
    row++;

    worksheet.getCell(`A${row}`).value = 'Total Amount';
    worksheet.getCell(`B${row}`).value = report.summary.totalAmount;
    worksheet.getCell(`B${row}`).numFmt = numFmt;
    row++;

    worksheet.getCell(`A${row}`).value = 'Total Discount';
    worksheet.getCell(`B${row}`).value = report.summary.totalDiscount;
    worksheet.getCell(`B${row}`).numFmt = numFmt;
    row++;

    worksheet.getCell(`A${row}`).value = 'Total Returns';
    worksheet.getCell(`B${row}`).value = report.summary.totalReturns;
    worksheet.getCell(`B${row}`).numFmt = numFmt;
    row++;

    worksheet.getCell(`A${row}`).value = 'Net Amount';
    worksheet.getCell(`B${row}`).value = report.summary.netAmount;
    worksheet.getCell(`B${row}`).numFmt = numFmt;
    row++;

    worksheet.getCell(`A${row}`).value = 'Average Transaction';
    worksheet.getCell(`B${row}`).value = report.summary.averageTransaction;
    worksheet.getCell(`B${row}`).numFmt = numFmt;
    row += 2;

    // Add breakdown if available
    if (report.breakdown && report.breakdown.length > 0) {
      worksheet.getCell(`A${row}`).value = 'Breakdown';
      worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
      row++;

      // Headers
      worksheet.getCell(`A${row}`).value = 'ID';
      worksheet.getCell(`B${row}`).value = 'Name';
      worksheet.getCell(`C${row}`).value = 'Total Amount';
      worksheet.getCell(`D${row}`).value = 'Transaction Count';
      worksheet.getRow(row).font = { bold: true };
      row++;

      // Data
      report.breakdown.forEach((item) => {
        worksheet.getCell(`A${row}`).value = item._id;
        worksheet.getCell(`B${row}`).value = item.name || 'N/A';
        worksheet.getCell(`C${row}`).value = item.totalAmount;
        worksheet.getCell(`C${row}`).numFmt = numFmt;
        worksheet.getCell(`D${row}`).value = item.transactionCount;
        row++;
      });
    }

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Export inventory report to PDF
   */
  async exportInventoryReportToPDF(
    report: InventoryReportResult,
  ): Promise<Buffer> {
    this.logger.log('Exporting inventory report to PDF');
    const currencyCode = await this.getReportCurrencyCode(report);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Inventory Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // Summary
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Products: ${report.summary.totalProducts}`);
      doc.text(`Total Batches: ${report.summary.totalBatches}`);
      doc.text(`Total Quantity: ${report.summary.totalQuantity}`);
      doc.text(
        `Total Value: ${CurrencyUtil.format(report.summary.totalValue, currencyCode)}`,
      );
      doc.text(`Low Stock Items: ${report.summary.lowStockItems}`);
      doc.text(`Expired Items: ${report.summary.expiredItems}`);
      doc.moveDown(2);

      // Items
      doc.fontSize(14).text('Inventory Items', { underline: true });
      doc.moveDown();

      report.items.forEach((item) => {
        doc.fontSize(12).text(`${item.productName || 'Unknown Product'}`);
        doc.fontSize(10);
        doc.text(`  Branch: ${item.branchName || 'Unknown'}`);
        doc.text(`  Total Quantity: ${item.totalQuantity}`);
        doc.text(
          `  Total Value: ${CurrencyUtil.format(item.totalValue, currencyCode)}`,
        );
        doc.text(
          `  Average Cost: ${CurrencyUtil.format(item.averageCost, currencyCode)}`,
        );
        doc.text(`  Batches: ${item.batchCount}`);
        if (item.isLowStock) {
          doc.fillColor('red').text('  (!) LOW STOCK', { continued: false });
          doc.fillColor('black');
        }
        doc.moveDown();

        if (doc.y > 700) {
          doc.addPage();
        }
      });

      doc.end();
    });
  }

  /**
   * Export inventory report to Excel
   */
  async exportInventoryReportToExcel(
    report: InventoryReportResult,
  ): Promise<Buffer> {
    this.logger.log('Exporting inventory report to Excel');
    const currencyCode = await this.getReportCurrencyCode(report);
    const numFmt = this.getCurrencyNumFmt(currencyCode);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Inventory Report');

    // Title
    worksheet.mergeCells('A1:F1');
    worksheet.getCell('A1').value = 'Inventory Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Summary
    let row = 3;
    worksheet.getCell(`A${row}`).value = 'Summary';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;

    const summaryData = [
      ['Total Products', report.summary.totalProducts],
      ['Total Batches', report.summary.totalBatches],
      ['Total Quantity', report.summary.totalQuantity],
      ['Total Value', report.summary.totalValue],
      ['Low Stock Items', report.summary.lowStockItems],
      ['Expired Items', report.summary.expiredItems],
    ];

    summaryData.forEach(([label, value]) => {
      worksheet.getCell(`A${row}`).value = label;
      worksheet.getCell(`B${row}`).value = value;
      if (label === 'Total Value') {
        worksheet.getCell(`B${row}`).numFmt = numFmt;
      }
      row++;
    });

    row += 2;

    // Items table
    worksheet.getCell(`A${row}`).value = 'Product';
    worksheet.getCell(`B${row}`).value = 'Branch';
    worksheet.getCell(`C${row}`).value = 'Quantity';
    worksheet.getCell(`D${row}`).value = 'Value';
    worksheet.getCell(`E${row}`).value = 'Avg Cost';
    worksheet.getCell(`F${row}`).value = 'Status';
    worksheet.getRow(row).font = { bold: true };
    row++;

    report.items.forEach((item) => {
      worksheet.getCell(`A${row}`).value = item.productName || 'Unknown';
      worksheet.getCell(`B${row}`).value = item.branchName || 'Unknown';
      worksheet.getCell(`C${row}`).value = item.totalQuantity;
      worksheet.getCell(`D${row}`).value = item.totalValue;
      worksheet.getCell(`D${row}`).numFmt = numFmt;
      worksheet.getCell(`E${row}`).value = item.averageCost;
      worksheet.getCell(`E${row}`).numFmt = numFmt;
      worksheet.getCell(`F${row}`).value = item.isLowStock ? 'LOW STOCK' : 'OK';
      if (item.isLowStock) {
        worksheet.getCell(`F${row}`).font = {
          color: { argb: 'FFFF0000' },
          bold: true,
        };
      }
      row++;
    });

    worksheet.columns.forEach((column) => {
      column.width = 18;
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Export expiry report to PDF
   */
  async exportExpiryReportToPDF(report: ExpiryReportResult): Promise<Buffer> {
    this.logger.log('Exporting expiry report to PDF');
    const currencyCode = await this.getReportCurrencyCode(report);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Expiry Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // Summary
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Batches: ${report.summary.totalBatches}`);
      doc.text(`Total Quantity: ${report.summary.totalQuantity}`);
      doc.text(
        `Potential Loss: ${CurrencyUtil.format(report.summary.potentialLoss, currencyCode)}`,
      );
      doc.text(`Expired Batches: ${report.summary.expiredBatches}`);
      doc.text(`Expired Quantity: ${report.summary.expiredQuantity}`);
      doc.text(
        `Expired Value: ${CurrencyUtil.format(report.summary.expiredValue, currencyCode)}`,
      );
      doc.moveDown(2);

      // Timeframe breakdown
      doc.fontSize(14).text('By Timeframe', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(
        `Expired: ${report.byTimeframe.expired.count} batches, ${report.byTimeframe.expired.quantity} units, ${CurrencyUtil.format(report.byTimeframe.expired.value, currencyCode)}`,
      );
      doc.text(
        `Within 30 Days: ${report.byTimeframe.within30Days.count} batches, ${report.byTimeframe.within30Days.quantity} units, ${CurrencyUtil.format(report.byTimeframe.within30Days.value, currencyCode)}`,
      );
      doc.text(
        `Within 60 Days: ${report.byTimeframe.within60Days.count} batches, ${report.byTimeframe.within60Days.quantity} units, ${CurrencyUtil.format(report.byTimeframe.within60Days.value, currencyCode)}`,
      );
      doc.text(
        `Within 90 Days: ${report.byTimeframe.within90Days.count} batches, ${report.byTimeframe.within90Days.quantity} units, ${CurrencyUtil.format(report.byTimeframe.within90Days.value, currencyCode)}`,
      );
      doc.moveDown(2);

      // Expiring batches (first 50)
      doc.fontSize(14).text('Expiring Batches (Top 50)', { underline: true });
      doc.moveDown();

      report.expiringBatches.slice(0, 50).forEach((batch) => {
        doc.fontSize(10);
        const status = batch.isExpired
          ? 'ERROR EXPIRED'
          : `(!) ${batch.daysUntilExpiry} days`;
        doc.text(`${batch.productName || 'Unknown'} - Lot: ${batch.lotNumber}`);
        doc.text(`  Branch: ${batch.branchName || 'Unknown'}`);
        doc.text(
          `  Quantity: ${batch.quantity}, Expiry: ${new Date(batch.expiryDate).toLocaleDateString()}`,
        );
        doc.text(
          `  Status: ${status}, Loss: ${CurrencyUtil.format(batch.potentialLoss, currencyCode)}`,
        );
        doc.moveDown();

        if (doc.y > 700) {
          doc.addPage();
        }
      });

      doc.end();
    });
  }

  /**
   * Export expiry report to Excel
   */
  async exportExpiryReportToExcel(report: ExpiryReportResult): Promise<Buffer> {
    this.logger.log('Exporting expiry report to Excel');
    const currencyCode = await this.getReportCurrencyCode(report);
    const numFmt = this.getCurrencyNumFmt(currencyCode);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Expiry Report');

    // Title
    worksheet.mergeCells('A1:G1');
    worksheet.getCell('A1').value = 'Expiry Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Summary
    let row = 3;
    worksheet.getCell(`A${row}`).value = 'Summary';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;

    const summaryData = [
      ['Total Batches', report.summary.totalBatches],
      ['Total Quantity', report.summary.totalQuantity],
      ['Potential Loss', report.summary.potentialLoss],
      ['Expired Batches', report.summary.expiredBatches],
      ['Expired Quantity', report.summary.expiredQuantity],
      ['Expired Value', report.summary.expiredValue],
    ];

    summaryData.forEach(([label, value]) => {
      worksheet.getCell(`A${row}`).value = label;
      worksheet.getCell(`B${row}`).value = value;
      if (
        typeof label === 'string' &&
        (label.includes('Loss') || label.includes('Value'))
      ) {
        worksheet.getCell(`B${row}`).numFmt = numFmt;
      }
      row++;
    });

    row += 2;

    // Batches table
    worksheet.getCell(`A${row}`).value = 'Product';
    worksheet.getCell(`B${row}`).value = 'Branch';
    worksheet.getCell(`C${row}`).value = 'Lot Number';
    worksheet.getCell(`D${row}`).value = 'Quantity';
    worksheet.getCell(`E${row}`).value = 'Expiry Date';
    worksheet.getCell(`F${row}`).value = 'Days Until Expiry';
    worksheet.getCell(`G${row}`).value = 'Potential Loss';
    worksheet.getRow(row).font = { bold: true };
    row++;

    report.expiringBatches.forEach((batch) => {
      worksheet.getCell(`A${row}`).value = batch.productName || 'Unknown';
      worksheet.getCell(`B${row}`).value = batch.branchName || 'Unknown';
      worksheet.getCell(`C${row}`).value = batch.lotNumber;
      worksheet.getCell(`D${row}`).value = batch.quantity;
      worksheet.getCell(`E${row}`).value = new Date(
        batch.expiryDate,
      ).toLocaleDateString();
      worksheet.getCell(`F${row}`).value = batch.daysUntilExpiry;
      worksheet.getCell(`G${row}`).value = batch.potentialLoss;
      worksheet.getCell(`G${row}`).numFmt = numFmt;

      if (batch.isExpired) {
        worksheet.getRow(row).font = { color: { argb: 'FFFF0000' } };
      } else if (batch.daysUntilExpiry <= 30) {
        worksheet.getRow(row).font = { color: { argb: 'FFFF6600' } };
      }
      row++;
    });

    worksheet.columns.forEach((column) => {
      column.width = 18;
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  /**
   * Export transfer report to PDF
   */
  async exportTransferReportToPDF(
    report: TransferReportResult,
  ): Promise<Buffer> {
    this.logger.log('Exporting transfer report to PDF');

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        margin: 50,
        size: 'A4',
        layout: 'landscape',
      });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // Header
      doc.fontSize(20).text('Transfer Report', { align: 'center' });
      doc.moveDown();
      doc
        .fontSize(10)
        .text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
      doc.moveDown(2);

      // Summary
      doc.fontSize(14).text('Summary', { underline: true });
      doc.moveDown();
      doc.fontSize(10);
      doc.text(`Total Transfers: ${report.summary.totalTransfers}`);
      doc.text(`Pending: ${report.summary.pendingTransfers}`);
      doc.text(`Approved: ${report.summary.approvedTransfers}`);
      doc.text(`Rejected: ${report.summary.rejectedTransfers}`);
      doc.text(`Completed: ${report.summary.completedTransfers}`);
      doc.moveDown(2);

      // Transfers
      doc.fontSize(14).text('Transfers', { underline: true });
      doc.moveDown();

      report.transfers.forEach((transfer) => {
        doc.fontSize(10);
        doc.text(`Transfer ID: ${transfer.transferId.substring(0, 8)}`);
        doc.text(
          `  From: ${transfer.sourceBranchName} -> To: ${transfer.destinationBranchName}`,
        );
        doc.text(
          `  Product: ${transfer.productName}, Quantity: ${transfer.quantity}`,
        );
        doc.text(`  Status: ${transfer.status.toUpperCase()}`);
        doc.text(
          `  Requested: ${new Date(transfer.createdAt).toLocaleDateString()} by ${transfer.requestedByName}`,
        );
        if (transfer.approvedBy) {
          doc.text(`  Approved by: ${transfer.approvedByName}`);
        }
        doc.moveDown();

        if (doc.y > 500) {
          doc.addPage();
        }
      });

      doc.end();
    });
  }

  /**
   * Export transfer report to Excel
   */
  async exportTransferReportToExcel(
    report: TransferReportResult,
  ): Promise<Buffer> {
    this.logger.log('Exporting transfer report to Excel');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Transfer Report');

    // Title
    worksheet.mergeCells('A1:H1');
    worksheet.getCell('A1').value = 'Transfer Report';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Summary
    let row = 3;
    worksheet.getCell(`A${row}`).value = 'Summary';
    worksheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;

    const summaryData = [
      ['Total Transfers', report.summary.totalTransfers],
      ['Pending', report.summary.pendingTransfers],
      ['Approved', report.summary.approvedTransfers],
      ['Rejected', report.summary.rejectedTransfers],
      ['Completed', report.summary.completedTransfers],
    ];

    summaryData.forEach(([label, value]) => {
      worksheet.getCell(`A${row}`).value = label;
      worksheet.getCell(`B${row}`).value = value;
      row++;
    });

    row += 2;

    // Transfers table
    worksheet.getCell(`A${row}`).value = 'Transfer ID';
    worksheet.getCell(`B${row}`).value = 'Source';
    worksheet.getCell(`C${row}`).value = 'Destination';
    worksheet.getCell(`D${row}`).value = 'Product';
    worksheet.getCell(`E${row}`).value = 'Quantity';
    worksheet.getCell(`F${row}`).value = 'Status';
    worksheet.getCell(`G${row}`).value = 'Requested By';
    worksheet.getCell(`H${row}`).value = 'Created Date';
    worksheet.getRow(row).font = { bold: true };
    row++;

    report.transfers.forEach((transfer) => {
      worksheet.getCell(`A${row}`).value = transfer.transferId;
      worksheet.getCell(`B${row}`).value =
        transfer.sourceBranchName || 'Unknown';
      worksheet.getCell(`C${row}`).value =
        transfer.destinationBranchName || 'Unknown';
      worksheet.getCell(`D${row}`).value = transfer.productName || 'Unknown';
      worksheet.getCell(`E${row}`).value = transfer.quantity;
      worksheet.getCell(`F${row}`).value = transfer.status.toUpperCase();
      worksheet.getCell(`G${row}`).value =
        transfer.requestedByName || 'Unknown';
      worksheet.getCell(`H${row}`).value = new Date(
        transfer.createdAt,
      ).toLocaleDateString();
      row++;
    });

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
