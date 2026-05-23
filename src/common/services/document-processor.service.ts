import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface ExtractedItem {
  name: string;
  quantity: number;
  unitPrice?: number;
}

export interface CustomerInfo {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface DocumentProcessingResult {
  rawText: string;
  extractedItems: ExtractedItem[];
  customerInfo: CustomerInfo;
}

const METADATA_PATTERNS = [
  /^(p\.?o?\s*[#:\/]|order\s*[#:\/]|purchase\s*order\s*[#:\/])/i,
  /^(invoice\s*[#:\/]|quote\s*[#:\/])/i,
  /^(date|delivery\s*date|valid\s*until|issue\s*date)\s*[:]/i,
  /^(page\s*\d+)/i,
  /^(tel|phone|fax|email|website|www\.)/i,
  /^(bill\s*to|ship\s*to|sold\s*to|shipped\s*to)/i,
  /^(terms?\s*(&|\band\b)?\s*conditions?|payment\s*terms|net\s+\d+)/i,
  /^(total|subtotal|amount\s*(due|paid)|balance|discount|tax|vat|shipping|freight)/i,
  /^[\d\s\/\-:]+$/,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
];

const COLUMN_HEADER_PATTERNS = [
  /^(item\s*[#\/]?|product\s*[#\/]?|code\s*[#\/]?|sku\s*[#\/]?)$/i,
  /^(description|item\s*description|product\s*name|name)$/i,
  /^(qty|quantity|qty\s*ordered|order\s*qty)$/i,
  /^(price|unit\s*price|rate|cost|amount|total)$/i,
];

const NON_PRODUCT_POST_FILTER = [
  /^(page|tel|fax|email|website|www\.|po\s*#|order\s*#|invoice\s*#|date|total|subtotal|amount|balance|discount|tax|vat|shipping|freight|terms|notes)$/i,
  /^[\d\s\/\-:]+$/,
  /^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/,
  /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
];

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private genAI: GoogleGenerativeAI | null = null;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    } else {
      this.logger.warn('GEMINI_API_KEY not set. AI extraction will be unavailable.');
    }
  }

  async processFile(
    buffer: Buffer,
    mimeType: string,
  ): Promise<DocumentProcessingResult> {
    let rawText = '';
    const ext = mimeType.toLowerCase();

    if (ext.includes('spreadsheet') || ext.includes('excel') || ext.endsWith('xlsx') || ext.endsWith('xls')) {
      rawText = this.parseExcel(buffer);
    } else if (ext.includes('word') || ext.includes('document') || ext.endsWith('docx')) {
      rawText = await this.parseDocx(buffer);
    } else if (ext.includes('pdf') || ext.endsWith('pdf')) {
      rawText = await this.parsePdf(buffer);
    } else if (ext.includes('image') || ext.includes('png') || ext.includes('jpg') || ext.includes('jpeg')) {
      rawText = await this.parseImageWithGemini(buffer, mimeType);
    } else {
      rawText = buffer.toString('utf-8');
    }

    const cleanedText = this.stripMetadata(rawText);
    const extracted = await this.extractWithAI(cleanedText);
    return {
      rawText,
      extractedItems: extracted.items,
      customerInfo: extracted.customerInfo,
    };
  }

  private stripMetadata(text: string): string {
    const lines = text.split('\n').filter((l) => l.trim());
    const contentLines: string[] = [];
    let startedDataSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (!startedDataSection) {
        const isColHeader = COLUMN_HEADER_PATTERNS.some((p) => p.test(trimmed));
        if (isColHeader) {
          startedDataSection = true;
          contentLines.push(trimmed);
          continue;
        }
      }

      const isMetadata = METADATA_PATTERNS.some((p) => p.test(trimmed));
      if (!isMetadata) {
        contentLines.push(trimmed);
      }
    }
    return contentLines.join('\n');
  }

  private parseExcel(buffer: Buffer): string {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];

      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        sheets.push(`--- Sheet: ${sheetName} ---`);

        const nonEmptyRows = json.filter((row) => row.some((c: any) => c != null && String(c).trim() !== ''));
        const dataStartIndex = this.findDataStartRow(nonEmptyRows);

        for (let i = dataStartIndex; i < nonEmptyRows.length; i++) {
          sheets.push(nonEmptyRows[i].filter((c: any) => c != null).join('\t'));
        }
      }
      return sheets.join('\n');
    } catch (error: any) {
      this.logger.error(`Excel parse error: ${error.message}`);
      return buffer.toString('utf-8');
    }
  }

  private findDataStartRow(rows: any[][]): number {
    const headerKeywords = ['item', 'description', 'product', 'qty', 'quantity', 'price', 'unit', 'code'];
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i];
      const rowText = row.filter((c: any) => c != null).map(String).join(' ').toLowerCase();
      const matchCount = headerKeywords.filter((kw) => rowText.includes(kw)).length;
      if (matchCount >= 2) {
        return i;
      }
    }
    const nonEmptyRows = rows.filter((r) => r.some((c: any) => c != null && String(c).trim() !== ''));
    if (nonEmptyRows.length > 3) {
      const firstRowText = nonEmptyRows[0].filter((c: any) => c != null).map(String).join(' ').toLowerCase();
      const looksLikeTitle = firstRowText.length < 80 && !/\d/.test(firstRowText);
      if (looksLikeTitle) {
        for (let i = 1; i < Math.min(nonEmptyRows.length, 6); i++) {
          const r = nonEmptyRows[i];
          const t = r.filter((c: any) => c != null).map(String).join(' ').toLowerCase();
          if (/\d/.test(t) && r.filter((c: any) => c != null).length >= 3) {
            return i;
          }
        }
      }
    }
    return 0;
  }

  private async parseDocx(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error: any) {
      this.logger.error(`Docx parse error: ${error.message}`);
      return buffer.toString('utf-8');
    }
  }

  private async parsePdf(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error: any) {
      this.logger.error(`PDF parse error: ${error.message}`);
      return buffer.toString('utf-8');
    }
  }

  private async parseImageWithGemini(
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    if (!this.genAI) {
      return 'AI extraction not available (no API key). Please enter items manually.';
    }
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const result = await model.generateContent([
        {
          inlineData: {
            data: buffer.toString('base64'),
            mimeType,
          },
        },
        'Extract all text from this purchase order image, especially product/medicine names, quantities, and prices. Ignore company logos, headers, and decorative elements.',
      ]);
      return result.response.text();
    } catch (error: any) {
      this.logger.error(`Gemini image parse error: ${error.message}`);
      return buffer.toString('utf-8');
    }
  }

  private async extractWithAI(
    text: string,
  ): Promise<{ items: ExtractedItem[]; customerInfo: CustomerInfo }> {
    const cleaned = text.slice(0, 20000);

    if (!this.genAI) {
      return {
        items: this.fallbackExtract(cleaned),
        customerInfo: {},
      };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are a pharmaceutical purchase order parser. Your job is to extract ONLY genuine medicine/product line items from the document text below.

Return ONLY valid JSON (no markdown, no code fences) with this exact structure:
{"customerInfo":{"name":"","phone":"","email":"","address":""},"items":[{"name":"product name","quantity":0,"unitPrice":0}]}

EXAMPLES of what to INCLUDE as items:
- "Amoxicillin 500mg Capsule  100  $15.00"  → {"name":"Amoxicillin 500mg Capsule","quantity":100,"unitPrice":15.00}
- "Paracetamol 250mg/5ml Syrup  50  $8.50" → {"name":"Paracetamol 250mg/5ml Syrup","quantity":50,"unitPrice":8.50}
- "Metformin 850mg Tablet  200"              → {"name":"Metformin 850mg Tablet","quantity":200}
- "IV Giving Set  30  $2.50"                 → {"name":"IV Giving Set","quantity":30,"unitPrice":2.50}
- "Item: 001  Description: Amoxicillin  Qty: 100  Rate: 15.00" → {"name":"Amoxicillin","quantity":100,"unitPrice":15.00}

EXAMPLES of what to IGNORE (NOT items):
- "Care Pharmacy" or "ABC Hospital" → this is the facility name, NOT a product
- "PO #: PO-2024-001" → order reference
- "Date: 2024-01-15" → date
- "123 Main Street, Freetown" → address
- "+232-77-123-456" → phone number
- "Item | Description | Qty | Price" → column headers
- "Total: $3,550.00" → summary total
- "Terms: Net 30 Days" → payment terms
- "Page 1 of 3" → page number
- "Shipping Address:" → section header

RULES:
1. IGNORE: company/facility names, addresses, phone numbers, emails, PO numbers, dates, terms & conditions, page numbers, headers, footers, column headers, totals, subtotals. These are NOT products.
2. EXTRACT only rows that look like medicine/product line items. A valid line item has a product name and a quantity number.
3. Pharmaceutical products usually have a drug name, often with strength (mg, ml, %, IU) and dosage form (tablet, capsule, injection, syrup, cream, ointment).
4. For customerInfo, only fill if you see a facility/hospital/clinic name clearly identified as the ordering party. Leave empty if unsure.
5. quantity must be a number. Default to 1 only if the context clearly indicates a single item.
6. unitPrice is optional — omit if not found (don't put 0).
7. If there are no clear product line items in the document, return an empty items array: {"customerInfo":{},"items":[]}

Document text:
${cleaned}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleanedJson = responseText.replace(/```(?:json)?\n?/g, '').trim();
      const parsed = JSON.parse(cleanedJson);
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const filteredItems = rawItems.filter((item: any) =>
        item.name &&
        typeof item.name === 'string' &&
        item.name.trim().length >= 3 &&
        typeof item.quantity === 'number' &&
        item.quantity > 0 &&
        item.quantity < 100000 &&
        !NON_PRODUCT_POST_FILTER.some((p) => p.test(item.name.trim()))
      );
      return {
        items: filteredItems,
        customerInfo: parsed.customerInfo || {},
      };
    } catch (error: any) {
      this.logger.error(`AI extraction failed: ${error.message}`);
      return {
        items: this.fallbackExtract(text),
        customerInfo: {},
      };
    }
  }

  private fallbackExtract(text: string): ExtractedItem[] {
    const items: ExtractedItem[] = [];
    const cleanedLines = this.stripMetadata(text).split('\n').filter((l) => l.trim());
    const lineRegex = /(.+?)\s+(\d+)\s*(?:x\s*)?([\d,.]+)?/i;

    for (const line of cleanedLines) {
      const trimmed = line.trim();
      if (
        trimmed.length < 5 ||
        METADATA_PATTERNS.some((p) => p.test(trimmed)) ||
        COLUMN_HEADER_PATTERNS.some((p) => p.test(trimmed))
      ) {
        continue;
      }
      const match = trimmed.match(lineRegex);
      if (match) {
        const name = match[1].trim();
        const qty = parseInt(match[2], 10);
        const price = match[3] ? parseFloat(match[3].replace(/,/g, '')) : undefined;
        if (name && name.length >= 3 && qty > 0 && qty < 100000) {
          items.push({ name, quantity: qty, unitPrice: price });
        }
      }
    }
    return items;
  }
}