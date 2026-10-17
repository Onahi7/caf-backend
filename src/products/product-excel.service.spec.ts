import ExcelJS from 'exceljs';
import { ProductExcelService } from './product-excel.service.js';

describe('Product Excel receiving and selling units', () => {
  const branchId = '507f1f77bcf86cd799439012';
  const supplierId = '507f1f77bcf86cd799439017';
  const user = { userId: '507f1f77bcf86cd799439014', username: 'qa', role: 'super_admin' };
  const create = jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439015' });
  const service = new ProductExcelService(
    {} as never,
    { findActive: async () => [{ _id: branchId, code: 'QA', name: 'QA', isHeadquarters: true }] } as never,
    { findActive: async () => [{ _id: supplierId, name: 'QA Supplier' }] } as never,
    { create } as never,
    { log: async () => undefined } as never,
  );
  const base = {
    name: 'Amlodipine Cards', barcode: 'AMLO-CARD', category: 'prescription',
    brand: 'QA', unit: 'card', base_price: 50, cost_price: 30,
    initial_supplier_name: 'QA Supplier', initial_expiry_date: '2028-12-31',
  };
  async function importRow(values: Record<string, string | number>) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');
    const headers = Object.keys(values);
    sheet.addRow(headers);
    sheet.addRow(headers.map((key) => values[key]));
    const fileBuffer = Buffer.from(await workbook.xlsx.writeBuffer());
    return service.importProductsFromWorkbook({ fileBuffer, resolvedBranchId: branchId, user });
  }
  beforeEach(() => create.mockClear());

  it('receives 10 packs of 3 cards as 30 cards, without enabling tablet or pack sales', async () => {
    const result = await importRow({ ...base, purchase_unit: 'pack', units_per_purchase_unit: 3, received_quantity: 10, received_unit_cost: 90, contents_description: '14 tablets per card' });
    expect(result).toMatchObject({ createdCount: 1, failedCount: 0 });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ unit: 'card', initialStock: 30, initialPurchasePrice: 30, purchaseUnit: 'pack', unitsPerPurchaseUnit: 3, contentsDescription: '14 tablets per card', packSizes: undefined }), user.userId);
  });

  it('receives 5 boxes of 25 laboratory kits and supports optional whole-box sales without JSON', async () => {
    const result = await importRow({ ...base, category: 'laboratory', unit: 'kit', purchase_unit: 'box', units_per_purchase_unit: 25, received_quantity: 5, pack_1_name: 'Box of 25 kits', pack_1_quantity: 25, pack_1_price: 450, pack_1_barcode: 'KIT-BOX' });
    expect(result.failedCount).toBe(0);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ initialStock: 125, packSizes: [expect.objectContaining({ name: 'Box of 25 kits', quantityPerPack: 25, sellingPrice: 450, barcode: 'KIT-BOX' })] }), user.userId);
  });

  it('continues accepting legacy stock counts and JSON packs without the new columns', async () => {
    const result = await importRow({ ...base, initial_stock: 30, pack_sizes_json: JSON.stringify([{ name: 'Pack', unit: 'pack', quantityPerPack: 3, sellingPrice: 150 }]) });
    expect(result.failedCount).toBe(0);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ initialStock: 30, packSizes: [expect.objectContaining({ quantityPerPack: 3 })] }), user.userId);
  });

  it.each([
    [{ purchase_unit: 'pack', units_per_purchase_unit: 3, received_quantity: 10, initial_stock: 420 }, 'conflicts'],
    [{ purchase_unit: 'pack', units_per_purchase_unit: 0, received_quantity: 10 }, 'at least 1'],
    [{ purchase_unit: 'card', units_per_purchase_unit: 3, received_quantity: 10 }, 'must be 1'],
    [{ purchase_unit: 'pack', units_per_purchase_unit: 3, received_quantity: -1 }, 'non-negative'],
    [{ purchase_unit: 'pack', units_per_purchase_unit: 3, received_quantity: 1.5 }, 'whole quantity'],
    [{ pack_1_name: 'Pack', pack_1_quantity: 3 }, 'requires a name'],
    [{ pack_1_name: 'Pack', pack_1_quantity: 3, pack_1_price: 150, pack_sizes_json: '[]' }, 'not both'],
  ])('rejects ambiguous or invalid receiving data (%j)', async (extra, message) => {
    const result = await importRow({ ...base, ...extra } as Record<string, string | number>);
    expect(result).toMatchObject({ createdCount: 0, failedCount: 1 });
    expect(result.errors[0].message).toContain(message);
    expect(create).not.toHaveBeenCalled();
  });

  it('provides card-only and laboratory examples in the downloadable workbook', async () => {
    const buffer = await service.buildImportTemplate({ resolvedBranchId: branchId, user });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as never);
    const sheet = workbook.getWorksheet('Products')!;
    const headers = sheet.getRow(3).values as string[];
    expect(headers).toEqual(expect.arrayContaining(['received_quantity', 'units_per_purchase_unit', 'contents_description', 'pack_1_name']));
    const result = await service.importProductsFromWorkbook({ fileBuffer: buffer, resolvedBranchId: branchId, user });
    expect(result.failedCount).toBe(0);
    expect(result.createdCount).toBe(5);
  });
});
