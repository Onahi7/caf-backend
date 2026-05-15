import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import ExcelJS from 'exceljs';
import { Model, Types } from 'mongoose';
import { BranchesService } from '../branches/branches.service.js';
import { SuppliersService } from '../suppliers/suppliers.service.js';
import { ProductsService } from './products.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  AuditAction,
  AuditResource,
} from '../audit/schemas/audit-log.schema.js';
import type { CurrentUserData } from '../auth/decorators/current-user.decorator.js';
import type { CreateProductDto } from './dto/create-product.dto.js';
import {
  Product,
  type ProductDocument,
} from './schemas/product.schema.js';

interface TemplateContext {
  resolvedBranchId?: string;
  user: CurrentUserData;
}

interface ImportContext {
  fileBuffer: Buffer;
  resolvedBranchId?: string;
  user: CurrentUserData;
}

interface ExportContext {
  resolvedBranchId?: string;
  user: CurrentUserData;
}

interface ImportRowError {
  row: number;
  productName: string;
  message: string;
}

interface ImportProductsResult {
  createdCount: number;
  failedCount: number;
  errors: ImportRowError[];
}

interface ParsedImportRow extends CreateProductDto {
  isActive?: boolean;
}

interface PackSizeInput {
  name: string;
  unit: string;
  quantityPerPack: number;
  sellingPrice: number;
  barcode?: string;
}

interface HeaderReadResult {
  headerMap: Map<string, number>;
  headerRowNumber: number;
}

const PRODUCT_TEMPLATE_COLUMNS = [
  'branch_code',
  'name',
  'sku',
  'barcode',
  'category',
  'brand',
  'unit',
  'reorder_level',
  'max_stock_level',
  'base_price',
  'cost_price',
  'suggested_retail_price',
  'markup_percentage',
  'requires_prescription',
  'is_controlled',
  'is_active',
  'initial_stock',
  'initial_purchase_price',
  'initial_selling_price',
  'initial_lot_number',
  'initial_expiry_date',
  'initial_supplier_name',
  'pack_sizes_json',
] as const;

const PRODUCT_CATEGORIES = [
  'prescription',
  'otc',
  'vitamins',
  'medical-devices',
  'personal-care',
  'baby-care',
  'first-aid',
  'diabetic-care',
  'cosmetics',
  'laboratory',
  'surgical',
  'dental',
  'other',
] as const;

const BOOLEAN_GUIDE = 'Accepted: true/false, yes/no, 1/0';

@Injectable()
export class ProductExcelService {
  private readonly logger = new Logger(ProductExcelService.name);

  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly branchesService: BranchesService,
    private readonly suppliersService: SuppliersService,
    private readonly productsService: ProductsService,
    private readonly auditService: AuditService,
  ) {}

  async buildImportTemplate({
    resolvedBranchId,
    user,
  }: TemplateContext): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CAREFARM POS';
    workbook.created = new Date();
    workbook.modified = new Date();

    const [branches, suppliers] = await Promise.all([
      this.branchesService.findActive(),
      this.suppliersService.findActive(),
    ]);

    const defaultBranch =
      branches.find((branch) => branch._id.toString() === resolvedBranchId) ||
      branches.find((branch) => branch.isHeadquarters) ||
      branches[0];
    const defaultSupplier = suppliers[0];

    this.addProductsSheet(
      workbook,
      defaultBranch?.code || '',
      defaultSupplier?.name || '',
    );
    this.addInstructionsSheet(workbook, defaultBranch?.code || '');
    this.addReferencesSheet(workbook, branches, suppliers);
    workbook.views = [
      {
        x: 0,
        y: 0,
        width: 12000,
        height: 8000,
        firstSheet: 0,
        activeTab: 0,
        visibility: 'visible',
      },
    ];

    await this.auditService
      .log({
        userId: user.userId,
        username: user.username,
        action: AuditAction.EXPORT,
        resource: AuditResource.PRODUCT,
        branchId: resolvedBranchId,
        description: 'Exported product Excel import template',
        metadata: {
          branchScope: resolvedBranchId || 'all',
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Skipping audit log for product template export: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async buildExportWorkbook({
    resolvedBranchId,
    user,
  }: ExportContext): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'CAREFARM POS';
    workbook.created = new Date();
    workbook.modified = new Date();

    const worksheet = workbook.addWorksheet('Products Export');
    worksheet.columns = [
      { header: 'Product Name', key: 'productName', width: 34 },
      { header: 'Brand Name', key: 'brandName', width: 24 },
      { header: 'Unit', key: 'unit', width: 16 },
      { header: 'Quantity', key: 'quantity', width: 14 },
      { header: 'Expiry', key: 'expiry', width: 18 },
      { header: 'Cost Price', key: 'costPrice', width: 16 },
      { header: 'Selling Price', key: 'sellingPrice', width: 16 },
    ];

    const products = await this.productModel
      .find(this.buildBranchFilter(resolvedBranchId))
      .sort({ name: 1, brand: 1, createdAt: 1 })
      .exec();

    for (const product of products) {
      worksheet.addRow({
        productName: product.name,
        brandName: product.brand,
        unit: product.unit,
        quantity: product.quantityAvailable ?? 0,
        expiry: this.formatDate(product.expiryDate),
        costPrice: product.costPrice ?? 0,
        sellingPrice:
          product.suggestedRetailPrice > 0
            ? product.suggestedRetailPrice
            : product.basePrice,
      });
    }

    worksheet.views = [{ state: 'frozen', ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: 7 },
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F3A2A' },
    };

    ['F', 'G'].forEach((column) => {
      worksheet.getColumn(column).numFmt = '#,##0.00';
    });
    worksheet.getColumn('D').numFmt = '#,##0.##';

    await this.auditService
      .log({
        userId: user.userId,
        username: user.username,
        action: AuditAction.EXPORT,
        resource: AuditResource.PRODUCT,
        branchId: resolvedBranchId,
        description: 'Exported products to Excel',
        metadata: {
          branchScope: resolvedBranchId || 'all',
          productCount: products.length,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Skipping audit log for product export: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      });

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async importProductsFromWorkbook({
    fileBuffer,
    resolvedBranchId,
    user,
  }: ImportContext): Promise<ImportProductsResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );

    const worksheet =
      workbook.getWorksheet('Products') || workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException(
        'The workbook must contain a worksheet named "Products".',
      );
    }

    const { headerMap, headerRowNumber } = this.readHeaderMap(worksheet);
    const missingHeaders = PRODUCT_TEMPLATE_COLUMNS.filter(
      (column) => !headerMap.has(column),
    );
    if (missingHeaders.length > 0) {
      throw new BadRequestException(
        `The import sheet is missing required columns: ${missingHeaders.join(', ')}`,
      );
    }

    const [branches, suppliers] = await Promise.all([
      this.branchesService.findActive(),
      this.suppliersService.findActive(),
    ]);

    const branchCodeMap = new Map(
      branches.map((branch) => [branch.code.trim().toUpperCase(), branch]),
    );
    const supplierNameMap = new Map(
      suppliers.map((supplier) => [supplier.name.trim().toLowerCase(), supplier]),
    );

    let createdCount = 0;
    const errors: ImportRowError[] = [];

    for (
      let rowNumber = headerRowNumber + 1;
      rowNumber <= worksheet.rowCount;
      rowNumber += 1
    ) {
      const row = worksheet.getRow(rowNumber);
      if (this.isRowEmpty(row)) {
        continue;
      }

      try {
        const parsed = this.parseImportRow(
          row,
          headerMap,
          branchCodeMap,
          supplierNameMap,
          resolvedBranchId,
        );

        const created = await this.productsService.create(parsed, user.userId);
        if (parsed.isActive === false) {
          await this.productsService.update(created._id.toString(), {
            isActive: false,
          });
        }
        createdCount += 1;
      } catch (error) {
        errors.push({
          row: rowNumber,
          productName:
            this.getCellText(row, headerMap.get('name')) || `Row ${rowNumber}`,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to import this row',
        });
      }
    }

    await this.auditService
      .log({
        userId: user.userId,
        username: user.username,
        action: AuditAction.CREATE,
        resource: AuditResource.PRODUCT,
        branchId: resolvedBranchId,
        description: 'Imported products from Excel',
        metadata: {
          createdCount,
          failedCount: errors.length,
          errors,
        },
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Skipping audit log for product import: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      });

    return {
      createdCount,
      failedCount: errors.length,
      errors,
    };
  }

  private addInstructionsSheet(workbook: ExcelJS.Workbook, branchCode: string) {
    const sheet = workbook.addWorksheet('Instructions');
    sheet.columns = [
      { header: 'Field', key: 'field', width: 28 },
      { header: 'Guidance', key: 'guidance', width: 100 },
    ];

    sheet.addRow([
      'How to use this file',
      'Fill products on the Products sheet. Keep the column header row unchanged. Delete the sample product rows before final import if you do not want them created.',
    ]);
    sheet.addRow([
      'branch_code',
      branchCode
        ? `Optional when importing from the ${branchCode} branch page. Leave blank to use the selected branch, or supply a valid branch code.`
        : 'Required for super admin imports unless you are importing from a branch-filtered page.',
    ]);
    sheet.addRow([
      'Required fields',
      'name, barcode, category, brand, unit, base_price, cost_price',
    ]);
    sheet.addRow([
      'Boolean fields',
      BOOLEAN_GUIDE,
    ]);
    sheet.addRow([
      'initial_stock rules',
      'If initial_stock is greater than 0, then initial_supplier_name and initial_expiry_date are required.',
    ]);
    sheet.addRow([
      'initial_expiry_date',
      'Use YYYY-MM-DD. Excel date cells are also accepted.',
    ]);
    sheet.addRow([
      'pack_sizes_json',
      'Use a JSON array, for example: [{"name":"Box","unit":"box","quantityPerPack":12,"sellingPrice":1500,"barcode":"BOX-001"}]',
    ]);
    sheet.addRow([
      'is_active',
      'Optional. Defaults to true when blank.',
    ]);

    sheet.getRow(1).font = { bold: true };
    sheet.eachRow((row) => {
      row.alignment = { vertical: 'top', wrapText: true };
    });
  }

  private addProductsSheet(
    workbook: ExcelJS.Workbook,
    branchCode: string,
    supplierName: string,
  ) {
    const sheet = workbook.addWorksheet('Products');
    sheet.columns = PRODUCT_TEMPLATE_COLUMNS.map((column) => ({
      key: column,
      width: Math.max(column.length + 4, 18),
    }));

    const headachePackSizes = JSON.stringify([
      {
        name: 'Box',
        unit: 'box',
        quantityPerPack: 12,
        sellingPrice: 1680,
        barcode: 'PCM-BOX-001',
      },
      {
        name: 'Strip',
        unit: 'strip',
        quantityPerPack: 6,
        sellingPrice: 840,
      },
    ]);

    const vitaminPackSizes = JSON.stringify([
      {
        name: 'Tube',
        unit: 'tube',
        quantityPerPack: 1,
        sellingPrice: 140,
        barcode: 'VITC-TUBE-001',
      },
      {
        name: 'Carton',
        unit: 'carton',
        quantityPerPack: 24,
        sellingPrice: 3200,
      },
    ]);

    const inhalerPackSizes = JSON.stringify([
      {
        name: 'Single Inhaler',
        unit: 'inhaler',
        quantityPerPack: 1,
        sellingPrice: 210,
        barcode: 'SALB-INH-SINGLE',
      },
      {
        name: 'Pack of 6',
        unit: 'pack',
        quantityPerPack: 6,
        sellingPrice: 1200,
      },
    ]);

    sheet.mergeCells(1, 1, 1, PRODUCT_TEMPLATE_COLUMNS.length);
    sheet.getCell('A1').value = 'Product Excel Import Template';
    sheet.getCell('A1').font = {
      bold: true,
      size: 16,
      color: { argb: 'FFFFFFFF' },
    };
    sheet.getCell('A1').alignment = { vertical: 'middle' };
    sheet.getCell('A1').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0B2B1F' },
    };
    sheet.getRow(1).height = 28;

    sheet.mergeCells(2, 1, 2, PRODUCT_TEMPLATE_COLUMNS.length);
    sheet.getCell('A2').value =
      'Use one row per product. Keep the header row unchanged and replace the sample rows with your real products.';
    sheet.getCell('A2').alignment = { vertical: 'middle', wrapText: true };
    sheet.getCell('A2').fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE9F7EF' },
    };
    sheet.getRow(2).height = 24;

    const headerRow = sheet.getRow(3);
    PRODUCT_TEMPLATE_COLUMNS.forEach((column, index) => {
      headerRow.getCell(index + 1).value = column;
    });
    headerRow.commit();

    sheet.addRow({
      branch_code: branchCode,
      name: 'Sample Paracetamol 500mg Tablets',
      sku: 'SAMPLE-PCM-500-TAB',
      barcode: 'SAMPLE-PCM-500-0001',
      category: 'otc',
      brand: 'CareRelief',
      unit: 'tablet',
      reorder_level: 20,
      max_stock_level: 200,
      base_price: 120,
      cost_price: 80,
      suggested_retail_price: 140,
      markup_percentage: 50,
      requires_prescription: 'false',
      is_controlled: 'false',
      is_active: 'true',
      initial_stock: 48,
      initial_purchase_price: 75,
      initial_selling_price: 140,
      initial_lot_number: 'LOT-PCM-001',
      initial_expiry_date: '2027-12-31',
      initial_supplier_name: supplierName,
      pack_sizes_json: headachePackSizes,
    });

    sheet.addRow({
      branch_code: branchCode,
      name: 'Sample Vitamin C 1000mg Effervescent',
      sku: 'SAMPLE-VITC-1000-EFF',
      barcode: 'SAMPLE-VITC-1000-0001',
      category: 'vitamins',
      brand: 'VitaBoost',
      unit: 'tube',
      reorder_level: 12,
      max_stock_level: 180,
      base_price: 120,
      cost_price: 82,
      suggested_retail_price: 140,
      markup_percentage: 45,
      requires_prescription: 'false',
      is_controlled: 'false',
      is_active: 'true',
      initial_stock: 36,
      initial_purchase_price: 82,
      initial_selling_price: 140,
      initial_lot_number: 'LOT-VITC-001',
      initial_expiry_date: '2028-06-30',
      initial_supplier_name: supplierName,
      pack_sizes_json: vitaminPackSizes,
    });

    sheet.addRow({
      branch_code: branchCode,
      name: 'Sample Salbutamol Inhaler 100mcg',
      sku: 'SAMPLE-SALB-INH-100',
      barcode: 'SAMPLE-SALB-INH-0001',
      category: 'prescription',
      brand: 'BreatheWell',
      unit: 'inhaler',
      reorder_level: 8,
      max_stock_level: 100,
      base_price: 180,
      cost_price: 130,
      suggested_retail_price: 210,
      markup_percentage: 35,
      requires_prescription: 'true',
      is_controlled: 'false',
      is_active: 'true',
      initial_stock: 18,
      initial_purchase_price: 130,
      initial_selling_price: 210,
      initial_lot_number: 'LOT-SALB-001',
      initial_expiry_date: '2027-09-30',
      initial_supplier_name: supplierName,
      pack_sizes_json: inhalerPackSizes,
    });

    sheet.views = [{ state: 'frozen', ySplit: 3 }];
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: 3, column: PRODUCT_TEMPLATE_COLUMNS.length },
    };
    sheet.getRow(3).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(3).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1F3A2A' },
    };
    sheet.getRow(3).alignment = { vertical: 'middle', wrapText: true };
    sheet.getRow(3).height = 32;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber >= 4) {
        row.alignment = { vertical: 'top', wrapText: true };
      }
    });
    sheet.getColumn('pack_sizes_json').width = 44;
  }

  private addReferencesSheet(
    workbook: ExcelJS.Workbook,
    branches: Array<{ code: string; name: string }>,
    suppliers: Array<{ name: string }>,
  ) {
    const sheet = workbook.addWorksheet('Reference Data');
    sheet.columns = [
      { header: 'Type', key: 'type', width: 20 },
      { header: 'Value', key: 'value', width: 32 },
      { header: 'Notes', key: 'notes', width: 48 },
    ];

    branches.forEach((branch) => {
      sheet.addRow({
        type: 'branch_code',
        value: branch.code,
        notes: branch.name,
      });
    });

    PRODUCT_CATEGORIES.forEach((category) => {
      sheet.addRow({
        type: 'category',
        value: category,
        notes: 'Matches the product form category values',
      });
    });

    suppliers.forEach((supplier) => {
      sheet.addRow({
        type: 'supplier_name',
        value: supplier.name,
        notes: 'Used when initial_stock is greater than 0',
      });
    });

    ['true', 'false', 'yes', 'no', '1', '0'].forEach((value) => {
      sheet.addRow({
        type: 'boolean',
        value,
        notes: BOOLEAN_GUIDE,
      });
    });

    sheet.getRow(1).font = { bold: true };
  }

  private readHeaderMap(worksheet: ExcelJS.Worksheet): HeaderReadResult {
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const headerMap = new Map<string, number>();
      const headerRow = worksheet.getRow(rowNumber);
      headerRow.eachCell((cell, colNumber) => {
        const value = String(cell.value ?? '')
          .trim()
          .toLowerCase();
        if (value) {
          headerMap.set(value, colNumber);
        }
      });

      if (headerMap.has('name') && headerMap.has('barcode')) {
        return { headerMap, headerRowNumber: rowNumber };
      }
    }

    return { headerMap: new Map<string, number>(), headerRowNumber: 1 };
  }

  private buildBranchFilter(branchId?: string): Record<string, unknown> {
    if (!branchId) {
      return {};
    }

    if (!Types.ObjectId.isValid(branchId)) {
      return { branchId };
    }

    return {
      branchId: { $in: [new Types.ObjectId(branchId), branchId] },
    };
  }

  private formatDate(value?: Date | string): string {
    if (!value) {
      return '';
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }

    return date.toISOString().slice(0, 10);
  }

  private isRowEmpty(row: ExcelJS.Row): boolean {
    if (row.actualCellCount === 0) {
      return true;
    }

    let hasContent = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const rawValue = cell.value;
      if (
        rawValue !== null &&
        rawValue !== undefined &&
        String(rawValue).trim() !== ''
      ) {
        hasContent = true;
      }
    });

    return !hasContent;
  }

  private parseImportRow(
    row: ExcelJS.Row,
    headerMap: Map<string, number>,
    branchCodeMap: Map<
      string,
      { _id: { toString(): string }; code: string }
    >,
    supplierNameMap: Map<
      string,
      { _id: { toString(): string }; name: string }
    >,
    resolvedBranchId?: string,
  ): ParsedImportRow {
    const branchCode = this.getCellText(row, headerMap.get('branch_code'))
      .trim()
      .toUpperCase();
    const branchId = this.resolveBranchIdForRow(
      branchCode,
      branchCodeMap,
      resolvedBranchId,
    );

    const initialStock = this.getOptionalNumber(
      row,
      headerMap.get('initial_stock'),
      0,
    ) ?? 0;
    const supplierName = this.getCellText(
      row,
      headerMap.get('initial_supplier_name'),
    ).trim();
    const supplier = supplierName
      ? supplierNameMap.get(supplierName.toLowerCase())
      : undefined;
    if (supplierName && !supplier) {
      throw new BadRequestException(
        `Unknown supplier "${supplierName}"`,
      );
    }

    const initialExpiryDate = this.getOptionalDate(
      row,
      headerMap.get('initial_expiry_date'),
    );

    const parsed: ParsedImportRow = {
      branchId,
      name: this.getRequiredText(row, headerMap.get('name'), 'name'),
      sku: this.getOptionalText(row, headerMap.get('sku')),
      barcode: this.getRequiredText(
        row,
        headerMap.get('barcode'),
        'barcode',
      ),
      category: this.getRequiredText(
        row,
        headerMap.get('category'),
        'category',
      ),
      brand: this.getRequiredText(row, headerMap.get('brand'), 'brand'),
      unit: this.getRequiredText(row, headerMap.get('unit'), 'unit'),
      reorderLevel:
        this.getOptionalNumber(
        row,
        headerMap.get('reorder_level'),
        0,
      ) ?? 0,
      maxStockLevel: this.getOptionalNumber(
        row,
        headerMap.get('max_stock_level'),
      ),
      basePrice: this.getRequiredNumber(
        row,
        headerMap.get('base_price'),
        'base_price',
      ),
      costPrice: this.getRequiredNumber(
        row,
        headerMap.get('cost_price'),
        'cost_price',
      ),
      suggestedRetailPrice: this.getOptionalNumber(
        row,
        headerMap.get('suggested_retail_price'),
      ),
      markupPercentage: this.getOptionalNumber(
        row,
        headerMap.get('markup_percentage'),
      ),
      requiresPrescription: this.getOptionalBoolean(
        row,
        headerMap.get('requires_prescription'),
        false,
      ),
      isControlled: this.getOptionalBoolean(
        row,
        headerMap.get('is_controlled'),
        false,
      ),
      isActive: this.getOptionalBoolean(
        row,
        headerMap.get('is_active'),
        true,
      ),
      initialStock,
      initialPurchasePrice: this.getOptionalNumber(
        row,
        headerMap.get('initial_purchase_price'),
      ),
      initialSellingPrice: this.getOptionalNumber(
        row,
        headerMap.get('initial_selling_price'),
      ),
      initialLotNumber: this.getOptionalText(
        row,
        headerMap.get('initial_lot_number'),
      ),
      initialExpiryDate,
      initialSupplierId: supplier?._id.toString(),
      packSizes: this.parsePackSizes(
        this.getOptionalText(row, headerMap.get('pack_sizes_json')),
      ),
    };

    if (initialStock > 0) {
      if (!parsed.initialSupplierId) {
        throw new BadRequestException(
          'initial_supplier_name is required when initial_stock is greater than 0',
        );
      }
      if (!parsed.initialExpiryDate) {
        throw new BadRequestException(
          'initial_expiry_date is required when initial_stock is greater than 0',
        );
      }
    }

    return parsed;
  }

  private resolveBranchIdForRow(
    branchCode: string,
    branchCodeMap: Map<string, { _id: { toString(): string } }>,
    resolvedBranchId?: string,
  ): string {
    if (!branchCode) {
      if (!resolvedBranchId) {
        throw new BadRequestException(
          'branch_code is required when no branch is selected for the import',
        );
      }
      return resolvedBranchId;
    }

    const branch = branchCodeMap.get(branchCode);
    if (!branch) {
      throw new BadRequestException(`Unknown branch_code "${branchCode}"`);
    }

    const branchId = branch._id.toString();
    if (resolvedBranchId && branchId !== resolvedBranchId) {
      throw new BadRequestException(
        `branch_code "${branchCode}" does not match the selected branch`,
      );
    }

    return branchId;
  }

  private getRequiredText(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
    fieldName: string,
  ): string {
    const value = this.getCellText(row, columnNumber).trim();
    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return value;
  }

  private getOptionalText(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
  ): string | undefined {
    const value = this.getCellText(row, columnNumber).trim();
    return value || undefined;
  }

  private getRequiredNumber(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
    fieldName: string,
  ): number {
    const value = this.getNumber(row, columnNumber);
    if (value === undefined) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    return value;
  }

  private getOptionalNumber(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
    defaultValue?: number,
  ): number | undefined {
    const value = this.getNumber(row, columnNumber);
    return value === undefined ? defaultValue : value;
  }

  private getOptionalBoolean(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
    defaultValue: boolean,
  ): boolean {
    const raw = this.getCellText(row, columnNumber).trim();
    if (!raw) {
      return defaultValue;
    }

    const normalized = raw.toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) {
      return true;
    }
    if (['false', 'no', '0'].includes(normalized)) {
      return false;
    }

    throw new BadRequestException(
      `Invalid boolean value "${raw}". ${BOOLEAN_GUIDE}`,
    );
  }

  private getOptionalDate(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
  ): string | undefined {
    if (!columnNumber) {
      return undefined;
    }
    const cell = row.getCell(columnNumber);
    const value = cell.value;

    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (typeof value === 'number') {
      const jsDate = new Date(Math.round((value - 25569) * 86400 * 1000));
      if (Number.isNaN(jsDate.getTime())) {
        throw new BadRequestException(
          'Invalid Excel date in initial_expiry_date',
        );
      }
      return jsDate.toISOString();
    }

    const text = this.getCellText(row, columnNumber).trim();
    if (!text) {
      return undefined;
    }

    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(
        `Invalid date "${text}" in initial_expiry_date`,
      );
    }
    return parsed.toISOString();
  }

  private parsePackSizes(value?: string): PackSizeInput[] | undefined {
    if (!value) {
      return undefined;
    }

    try {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) {
        throw new Error('pack_sizes_json must be a JSON array');
      }

      return parsed.map((item, index) => {
        if (!item || typeof item !== 'object') {
          throw new Error(
            `pack_sizes_json item ${index + 1} must be an object`,
          );
        }

        const pack = item as Record<string, unknown>;
        const name = String(pack.name ?? '').trim();
        const unit = String(pack.unit ?? '').trim();
        const quantityPerPack = Number(pack.quantityPerPack);
        const sellingPrice = Number(pack.sellingPrice);
        const barcode = String(pack.barcode ?? '').trim();

        if (!name || !unit) {
          throw new Error(
            `pack_sizes_json item ${index + 1} requires name and unit`,
          );
        }
        if (!Number.isFinite(quantityPerPack) || quantityPerPack < 1) {
          throw new Error(
            `pack_sizes_json item ${index + 1} requires quantityPerPack >= 1`,
          );
        }
        if (!Number.isFinite(sellingPrice) || sellingPrice < 0) {
          throw new Error(
            `pack_sizes_json item ${index + 1} requires sellingPrice >= 0`,
          );
        }

        return {
          name,
          unit,
          quantityPerPack,
          sellingPrice,
          barcode: barcode || undefined,
        };
      });
    } catch (error) {
      this.logger.warn(
        `Failed to parse pack_sizes_json: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Invalid pack_sizes_json',
      );
    }
  }

  private getNumber(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
  ): number | undefined {
    if (!columnNumber) {
      return undefined;
    }
    const rawText = this.getCellText(row, columnNumber).trim();
    if (!rawText) {
      return undefined;
    }
    const value = Number(rawText);
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`Invalid number "${rawText}"`);
    }
    return value;
  }

  private getCellText(
    row: ExcelJS.Row,
    columnNumber: number | undefined,
  ): string {
    if (!columnNumber) {
      return '';
    }
    const value = row.getCell(columnNumber).value;
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      if ('text' in value && typeof value.text === 'string') {
        return value.text;
      }
      if ('result' in value && value.result !== undefined && value.result !== null) {
        return String(value.result);
      }
      if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
      }
    }
    return String(value);
  }
}
