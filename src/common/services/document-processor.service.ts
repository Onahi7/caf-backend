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
      const prompt = `You are a purchase order parser. Extract line items and customer info from this document.

Return ONLY valid JSON (no markdown, no code fences) with this structure:
{
  "customerInfo": { "name": "", "phone": "", "email": "", "address": "" },
  "items": [{ "name": "product name", "quantity": 0, "unitPrice": 0 }]
}

Rules:
- quantity must be a number (default 1 if unclear)
- unitPrice is optional (omit if not found, don't put 0)
- For customerInfo, fill what you can find, leave empty strings for missing fields
- If no customer info found, return empty strings

Document text:
${text.slice(0, 20000)}`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const cleaned = responseText.replace(/```(?:json)?\n?/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
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
