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

    const extracted = await this.extractWithAI(rawText);
    return {
      rawText,
      extractedItems: extracted.items,
      customerInfo: extracted.customerInfo,
    };
  }

  private parseExcel(buffer: Buffer): string {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheets: string[] = [];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        sheets.push(`--- Sheet: ${sheetName} ---`);
        for (const row of json) {
          sheets.push(row.filter((c: any) => c != null).join('\t'));
        }
      }
      return sheets.join('\n');
    } catch (error: any) {
      this.logger.error(`Excel parse error: ${error.message}`);
      return buffer.toString('utf-8');
    }
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
        'Extract all text from this image, especially product names, quantities, and prices.',
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
    if (!this.genAI) {
      return {
        items: this.fallbackExtract(text),
        customerInfo: {},
      };
    }

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
      const prompt = `You are a pharmaceutical purchase order parser. Extract ONLY genuine medicine/product line items and customer info.

Return ONLY valid JSON (no markdown, no code fences) with this structure:
{
  "customerInfo": { "name": "", "phone": "", "email": "", "address": "" },
  "items": [{ "name": "product name", "quantity": 0, "unitPrice": 0 }]
}

CRITICAL — What to IGNORE (DO NOT extract as items):
- Company name, logo, or business title of the ordering facility
- PO number, order number, reference number
- Date, delivery date, valid until date
- Address, city, phone number, email, website
- "Bill To", "Ship To" sections and their contents
- Terms & conditions, payment terms, notes
- Headers, footers, page numbers
- Any single word or short text that is clearly a header label (e.g. "Item", "Description", "Qty", "Price", "Total")
- Any text that contains "Page", "Tel:", "Fax:", "Email:", "Website:"
- The supplier/vendor name if it appears at the top of the document

What to EXTRACT as items:
- Only rows that appear to be product/medicine line items in a table or list
- Pharmaceutical products typically have: a drug name + strength (e.g. "Amoxicillin 500mg", "Paracetamol 250mg/5ml")
- Look for rows containing: product name/number + quantity + optionally a unit price
- A line item must have a quantity (number) to be included

Rules:
- quantity must be a number (default 1 if unclear but prefer to skip if no number found)
- unitPrice is optional (omit if not found, don't put 0)
- For customerInfo, only include the actual customer/facility name (NOT "Care Pharmacy" or similar header text)
- If no customer info found, return empty strings
- If the document text is mostly meta-data with no clear line items, return an empty items array

Document text:
${text.slice(0, 20000)}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleaned = responseText.replace(/```(?:json)?\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
      const filteredItems = rawItems.filter((item: any) =>
        item.name &&
        typeof item.name === 'string' &&
        item.name.trim().length >= 3 &&
        typeof item.quantity === 'number' &&
        item.quantity > 0 &&
        !/^(page|tel|fax|email|website|po\s*#|order\s*#|date|total|subtotal|amount)$/i.test(item.name.trim())
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
    const lines = text.split('\n').filter((l) => l.trim());
    const items: ExtractedItem[] = [];
    const lineRegex = /(.+?)\s+(\d+)\s*(?:x\s*)?([\d,.]+)?/i;
    for (const line of lines) {
      const match = line.match(lineRegex);
      if (match) {
        const name = match[1].trim();
        const qty = parseInt(match[2], 10);
        const price = match[3] ? parseFloat(match[3].replace(/,/g, '')) : undefined;
        if (name && qty > 0) {
          items.push({ name, quantity: qty, unitPrice: price });
        }
      }
    }
    return items;
  }
}
