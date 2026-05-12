import { BadRequestException, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { ProductsRepository } from './products.repository.js';
import { ProductsService } from './products.service.js';

interface ExtractedRequestItem {
  rowNumber: number;
  rawText: string;
  itemName: string;
  quantityRequested: number | null;
  requestedUnit: string | null;
  notes?: string;
}

@Injectable()
export class RequestAnalysisService {
  constructor(
    private readonly productsRepository: ProductsRepository,
    private readonly productsService: ProductsService,
  ) {}

  async analyzeUpload(params: {
    branchId: string;
    fileBuffer: Buffer;
    filename: string;
    mimeType?: string;
  }) {
    const extension = this.getExtension(params.filename);
    const extractedItems = await this.extractItems(
      params.fileBuffer,
      extension,
      params.mimeType,
    );

    if (extractedItems.length === 0) {
      throw new BadRequestException(
        'No request items could be extracted from the uploaded file',
      );
    }

    const branchProducts = await this.productsRepository.findAll(params.branchId);
    const catalog = await this.productsService.attachSellingPriceAndStock(
      branchProducts,
      params.branchId,
    );

    return {
      extractedCount: extractedItems.length,
      items: extractedItems.map((item) => this.matchItem(item, catalog)),
    };
  }

  private getExtension(filename: string): string {
    const normalized = filename.toLowerCase().trim();
    const lastDot = normalized.lastIndexOf('.');
    return lastDot >= 0 ? normalized.slice(lastDot + 1) : '';
  }

  private async extractItems(
    fileBuffer: Buffer,
    extension: string,
    mimeType?: string,
  ): Promise<ExtractedRequestItem[]> {
    if (extension === 'xlsx') {
      return this.extractSpreadsheetItems(fileBuffer);
    }

    if (extension === 'csv') {
      return this.extractDelimitedItems(fileBuffer.toString('utf8'));
    }

    if (extension === 'docx') {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return this.extractTextItems(result.value);
    }

    if (
      ['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(extension) ||
      mimeType?.startsWith('image/')
    ) {
      const worker = await createWorker('eng');
      try {
        const result = await worker.recognize(fileBuffer);
        return this.extractTextItems(result.data.text);
      } finally {
        await worker.terminate();
      }
    }

    throw new BadRequestException(
      'Unsupported file type. Please upload .xlsx, .csv, .docx, or an image.',
    );
  }

  private async extractSpreadsheetItems(
    fileBuffer: Buffer,
  ): Promise<ExtractedRequestItem[]> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as never);
    const items: ExtractedRequestItem[] = [];

    workbook.eachSheet((sheet) => {
      sheet.eachRow((row, rowNumber) => {
        const rowValues = Array.isArray(row.values) ? row.values.slice(1) : [];
        const values = rowValues
          .map((value: ExcelJS.CellValue) => this.cellToString(value))
          .filter(Boolean);

        if (values.length === 0) {
          return;
        }

        const extracted = this.buildItemFromCells(values, rowNumber);
        if (extracted) {
          items.push(extracted);
        }
      });
    });

    return items;
  }

  private extractDelimitedItems(text: string): ExtractedRequestItem[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    return lines
      .map((line, index) => {
        const cells = line.split(',').map((value) => value.trim()).filter(Boolean);
        return this.buildItemFromCells(cells, index + 1);
      })
      .filter((item): item is ExtractedRequestItem => Boolean(item));
  }

  private extractTextItems(text: string): ExtractedRequestItem[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter((line) => line.length > 2)
      .map((line, index) => this.parseFreeformLine(line, index + 1))
      .filter((item): item is ExtractedRequestItem => Boolean(item));
  }

  private buildItemFromCells(
    cells: string[],
    rowNumber: number,
  ): ExtractedRequestItem | null {
    const cleaned = cells.filter((cell) => !/^(s\/?n|sn|no|qty|date)$/i.test(cell));
    if (cleaned.length === 0) {
      return null;
    }

    const description =
      cleaned.find((cell) => /[a-z]/i.test(cell) && cell.length > 5) ?? cleaned[0];
    const qtyCell =
      cleaned.find((cell) => /\d/.test(cell) && cell !== description) ?? null;
    const qty = qtyCell ? this.extractQuantity(qtyCell) : null;
    const requestedUnit = qtyCell ? this.extractUnit(qtyCell) : null;

    return {
      rowNumber,
      rawText: cleaned.join(' | '),
      itemName: description,
      quantityRequested: qty,
      requestedUnit,
      notes: cleaned.filter((cell) => cell !== description && cell !== qtyCell).join(' | ') || undefined,
    };
  }

  private parseFreeformLine(
    line: string,
    rowNumber: number,
  ): ExtractedRequestItem | null {
    const withoutLeadingNumber = line.replace(/^\d+[\).\-\s]+/, '').trim();
    if (withoutLeadingNumber.length < 3) {
      return null;
    }

    return {
      rowNumber,
      rawText: line,
      itemName: withoutLeadingNumber.replace(/\b\d+\s*(amp|amps|tabs|tablets|pcs|pieces|vials|bottles|boxes)\b.*$/i, '').trim() || withoutLeadingNumber,
      quantityRequested: this.extractQuantity(withoutLeadingNumber),
      requestedUnit: this.extractUnit(withoutLeadingNumber),
    };
  }

  private matchItem(
    item: ExtractedRequestItem,
    catalog: Array<Record<string, unknown>>,
  ) {
    const normalizedItem = this.normalize(item.itemName);
    const scored = catalog
      .map((product) => ({
        product,
        score: this.scoreMatch(normalizedItem, this.buildProductSearchText(product)),
      }))
      .filter((candidate) => candidate.score > 0.22)
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    const matchedProduct = best?.product;

    return {
      ...item,
      status: matchedProduct ? 'matched' : 'missing',
      confidence: matchedProduct ? Number(best.score.toFixed(2)) : 0,
      matchedProduct: matchedProduct
        ? {
            _id: matchedProduct._id,
            name: matchedProduct.name,
            brand: matchedProduct.brand,
            sku: matchedProduct.sku,
            category: matchedProduct.category,
            unit: matchedProduct.unit,
            stock: matchedProduct.stock ?? 0,
            price: matchedProduct.price ?? 0,
          }
        : null,
      alternatives: scored.slice(1, 4).map((candidate) => ({
        _id: candidate.product._id,
        name: candidate.product.name,
        brand: candidate.product.brand,
        stock: candidate.product.stock ?? 0,
        price: candidate.product.price ?? 0,
        confidence: Number(candidate.score.toFixed(2)),
      })),
    };
  }

  private buildProductSearchText(product: Record<string, unknown>): string {
    return this.normalize(
      [
        product.name,
        product.brand,
        product.category,
        product.sku,
        product.barcode,
      ]
        .filter(Boolean)
        .join(' '),
    );
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private scoreMatch(itemText: string, productText: string): number {
    if (!itemText || !productText) {
      return 0;
    }

    if (itemText === productText) {
      return 1;
    }

    if (productText.includes(itemText) || itemText.includes(productText)) {
      return 0.85;
    }

    const itemTokens = new Set(itemText.split(' '));
    const productTokens = new Set(productText.split(' '));
    const overlap = [...itemTokens].filter((token) => productTokens.has(token));
    const union = new Set([...itemTokens, ...productTokens]);

    if (union.size === 0) {
      return 0;
    }

    return overlap.length / union.size;
  }

  private extractQuantity(value: string): number | null {
    const match = value.match(/(\d+(?:\.\d+)?)(?:\s*\+\s*(\d+(?:\.\d+)?))?/);
    if (!match) {
      return null;
    }

    const base = Number(match[1]);
    const extra = match[2] ? Number(match[2]) : 0;
    return Number.isFinite(base + extra) ? base + extra : null;
  }

  private extractUnit(value: string): string | null {
    const match = value.match(
      /\b(amp|amps|ampoule|ampoules|vial|vials|tab|tabs|tablet|tablets|pcs|pieces|box|boxes|bottle|bottles|cup|cups|strip|strips)\b/i,
    );
    return match ? match[1].toLowerCase() : null;
  }

  private cellToString(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string' || typeof value === 'number') {
      return String(value).trim();
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    if (typeof value === 'object' && 'text' in value) {
      return String(value.text ?? '').trim();
    }

    if (typeof value === 'object' && 'result' in value) {
      return String(value.result ?? '').trim();
    }

    return '';
  }
}
