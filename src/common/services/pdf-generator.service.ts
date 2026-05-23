import { Injectable } from '@nestjs/common';
import * as PdfPrinter from 'pdfmake';
import { TDocumentDefinitions, TFontDictionary } from 'pdfmake/interfaces';

interface ProformaData {
  proformaNumber: string;
  customerName: string;
  customerAddress?: string;
  customerPhone?: string;
  date: string;
  validUntil: string;
  items: Array<{ name: string; quantity: number; unitPrice: number; total: number }>;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes?: string;
  pharmacyName?: string;
  pharmacyAddress?: string;
  pharmacyPhone?: string;
}

interface DeliveryData {
  deliveryNumber: string;
  customerName: string;
  customerAddress?: string;
  date: string;
  items: Array<{ name: string; quantity: number }>;
  notes?: string;
}

@Injectable()
export class PdfGeneratorService {
  private fonts: TFontDictionary = {
    Roboto: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  };

  async generateProformaPdf(data: ProformaData): Promise<Buffer> {
    const printer = new (PdfPrinter as any)(this.fonts);
    const docDef: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        { text: data.pharmacyName || 'CAREFARM PHARMACY', style: 'header' },
        { text: data.pharmacyAddress || '', style: 'subheader' },
        { text: data.pharmacyPhone || '', style: 'subheader' },
        { text: '\n' },
        { text: 'PROFORMA INVOICE', style: 'title' },
        { text: '\n' },
        {
          columns: [
            { text: `Number: ${data.proformaNumber}`, alignment: 'left' },
            { text: `Date: ${data.date}`, alignment: 'right' },
          ],
        },
        { text: `Valid Until: ${data.validUntil}`, alignment: 'left' },
        { text: '\n' },
        { text: `Customer: ${data.customerName}`, style: 'label' },
        ...(data.customerAddress ? [{ text: `Address: ${data.customerAddress}`, margin: [0, 2, 0, 2] } as any] : []),
        ...(data.customerPhone ? [{ text: `Phone: ${data.customerPhone}`, margin: [0, 2, 0, 2] } as any] : []),
        { text: '\n' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 60, 80, 80],
            body: [
              [
                { text: 'Product', style: 'tableHeader' },
                { text: 'Qty', style: 'tableHeader', alignment: 'center' },
                { text: 'Unit Price', style: 'tableHeader', alignment: 'right' },
                { text: 'Total', style: 'tableHeader', alignment: 'right' },
              ],
              ...data.items.map((item) => [
                item.name,
                { text: item.quantity.toString(), alignment: 'center' },
                { text: item.unitPrice.toFixed(2), alignment: 'right' },
                { text: item.total.toFixed(2), alignment: 'right' },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: '\n' },
        {
          columns: [
            { width: '*', text: '' },
            {
              width: 200,
              stack: [
                { text: `Subtotal: ${data.subtotal.toFixed(2)}`, alignment: 'right' },
                { text: `VAT (${(data.taxRate * 100).toFixed(0)}%): ${data.taxAmount.toFixed(2)}`, alignment: 'right' },
                { text: `Total: ${data.total.toFixed(2)}`, alignment: 'right', bold: true, fontSize: 14 },
              ],
            },
          ],
        },
        { text: '\n' },
        ...(data.notes ? [{ text: `Notes: ${data.notes}`, italics: true }] : []),
      ],
      styles: {
        header: { fontSize: 18, bold: true, color: '#1a73e8' },
        subheader: { fontSize: 10, color: '#666' },
        title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 10, 0, 10] },
        label: { fontSize: 11, bold: true },
        tableHeader: { fontSize: 10, bold: true, fillColor: '#eee' },
      },
      defaultStyle: { fontSize: 10 },
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDef);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }

  async generateDeliveryNotePdf(data: DeliveryData): Promise<Buffer> {
    const printer = new (PdfPrinter as any)(this.fonts);
    const docDef: TDocumentDefinitions = {
      pageSize: 'A4',
      pageMargins: [40, 60, 40, 60],
      content: [
        { text: 'CAREFARM PHARMACY', style: 'header' },
        { text: '\n' },
        { text: 'DELIVERY NOTE', style: 'title' },
        { text: '\n' },
        {
          columns: [
            { text: `Number: ${data.deliveryNumber}`, alignment: 'left' },
            { text: `Date: ${data.date}`, alignment: 'right' },
          ],
        },
        { text: '\n' },
        { text: `Customer: ${data.customerName}`, style: 'label' },
        ...(data.customerAddress ? [{ text: `Address: ${data.customerAddress}`, margin: [0, 2, 0, 2] } as any] : []),
        { text: '\n' },
        {
          table: {
            headerRows: 1,
            widths: ['*', 60],
            body: [
              [
                { text: 'Product', style: 'tableHeader' },
                { text: 'Quantity', style: 'tableHeader', alignment: 'center' },
              ],
              ...data.items.map((item) => [
                item.name,
                { text: item.quantity.toString(), alignment: 'center' },
              ]),
            ],
          },
          layout: 'lightHorizontalLines',
        },
        { text: '\n' },
        ...(data.notes ? [{ text: `Notes: ${data.notes}`, italics: true }] : []),
        { text: '\n\n' },
        { text: 'Received By: ___________________', margin: [0, 20, 0, 0] },
        { text: 'Signature: ___________________', margin: [0, 10, 0, 0] },
        { text: 'Date: ___________________', margin: [0, 10, 0, 0] },
      ],
      styles: {
        header: { fontSize: 18, bold: true, color: '#1a73e8' },
        title: { fontSize: 16, bold: true, alignment: 'center', margin: [0, 10, 0, 10] },
        label: { fontSize: 11, bold: true },
        tableHeader: { fontSize: 10, bold: true, fillColor: '#eee' },
      },
      defaultStyle: { fontSize: 10 },
    };

    return new Promise((resolve, reject) => {
      const pdfDoc = printer.createPdfKitDocument(docDef);
      const chunks: Buffer[] = [];
      pdfDoc.on('data', (chunk: Buffer) => chunks.push(chunk));
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });
  }
}
