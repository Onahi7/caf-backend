// Imports the reviewed notebook transcription as inactive products.
// Default is a read-only dry run. Use --apply only after reviewing the report.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-notebook-20261017-v1';
const BRANCH_CODE = 'Kono12';
const sourcePath = path.join(__dirname, 'data', 'kono-notebook-20261017.json');
const reportDir = path.resolve(__dirname, '../../outputs/kono-import-preflight-20261024');
const apply = process.argv.includes('--apply');
const replaceUnreviewed = process.argv.includes('--replace-unreviewed') || process.argv.includes('--force');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const sourceHash = crypto.createHash('sha256').update(JSON.stringify(source)).digest('hex');

function expiryFromMonth(text) {
  const match = String(text || '').match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

function planRow(row) {
  const pending = [];
  if (!Number.isFinite(row.quantity) || row.quantity <= 0) pending.push('Quantity missing');
  if (!Number.isFinite(row.sellingPrice) || row.sellingPrice < 0) pending.push('Selling price missing');
  if (!row.stockUnit) pending.push('Stock unit missing');
  const expiryDate = expiryFromMonth(row.expiryAsWritten);
  if (!expiryDate) pending.push('Expiry missing or invalid');
  return {
    ...row,
    sku: `KONO-NBK-${String(row.entry).padStart(3, '0')}`,
    expiryDate,
    pending,
    createBatch: pending.length === 0,
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  if (source.length !== 84 || new Set(source.map(row => row.entry)).size !== 84) {
    throw new Error('Expected 84 distinct notebook entries');
  }
  if (source.some(row => !row.nameAsRead || !row.sourceLine)) {
    throw new Error('Every entry requires its original name and source location');
  }
  const rows = source.map(planRow);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false,
  });
  const db = mongoose.connection.db;
  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE, isActive: true });
  if (!branch || branch.name !== 'Kono' || branch.currencyCode !== 'SLE') {
    throw new Error('Expected active Kono branch Kono12 in SLE');
  }
  const supplier = await db.collection('suppliers').findOne({
    name: 'Manual Notebook Import Supplier', isActive: true,
  });
  const actor = await db.collection('users').findOne({
    role: 'super_admin', isActive: { $ne: false },
  }, { projection: { _id: 1 } });
  if (!supplier || !actor) throw new Error('Import supplier and active admin are required');

  const existingImport = await db.collection('inventoryimports').findOne({ _id: IMPORT_ID });
  if (existingImport && existingImport.sourceHash !== sourceHash && !replaceUnreviewed) {
    throw new Error('Source changed after import; use --replace-unreviewed to update pending import');
  }
  const existingSkus = await db.collection('products').find({
    branchId: branch._id, sku: { $in: rows.map(row => row.sku) },
  }, { projection: { sku: 1 } }).toArray();
  if (!existingImport && existingSkus.length && !replaceUnreviewed) {
    throw new Error('Import SKUs already exist without an import receipt; review before proceeding');
  }
  const report = {
    importId: IMPORT_ID, sourceHash, database: db.databaseName,
    branch: { id: branch._id, name: branch.name, code: branch.code, currency: branch.currencyCode },
    alreadyImported: Boolean(existingImport),
    plannedProducts: rows.length,
    plannedBatches: rows.filter(row => row.createBatch).length,
    plannedMovements: rows.filter(row => row.createBatch).length,
    activeProducts: 0,
    policy: {
      names: 'Original transcription preserved, including question marks',
      missingCosts: 'Provisional numeric zero with purchaseCostUnknown=true; products inactive',
      supplier: 'Existing Manual Notebook Import Supplier, not a claimed original supplier',
      barcodes: 'Internal INT-KONO-NBK identifiers, not manufacturer barcodes',
      expiry: 'Readable month/year interpreted as the end of that month in UTC',
      units: 'Original cards, packets, bottles and vials; no smaller-unit conversion',
      missingBatchFields: 'No batch or stock movement; raw values retained for correction',
    },
    pendingBatches: rows.filter(row => !row.createBatch).map(row => ({
      entry: row.entry, name: row.nameAsRead, reasons: row.pending,
    })),
  };
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'preflight.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (!apply || (existingImport && !replaceUnreviewed)) return;

  // Preserve existing Kono records before any write. No existing rows are replaced.
  const backup = {};
  for (const collection of ['products', 'batches', 'stockmovements']) {
    backup[collection] = await db.collection(collection).find({ branchId: branch._id }).toArray();
  }
  fs.writeFileSync(path.join(reportDir, `before-${Date.now()}.json`), JSON.stringify(backup, null, 2));

  const { ProductSchema } = require('../dist/products/schemas/product.schema.js');
  const { BatchSchema } = require('../dist/batches/schemas/batch.schema.js');
  const { StockMovementSchema } = require('../dist/inventory/schemas/stock-movement.schema.js');
  const Product = mongoose.model('KonoImportProduct', ProductSchema);
  const Batch = mongoose.model('KonoImportBatch', BatchSchema);
  const Movement = mongoose.model('KonoImportMovement', StockMovementSchema);
  const products = [], batches = [], movements = [];
  const now = new Date();
  for (const row of rows) {
    const original = source.find(item => item.entry === row.entry);
    const metadata = {
      importId: IMPORT_ID, sourceHash, original,
      status: 'pending_admin_review', purchaseCostUnknown: true,
      manufacturerBarcodeMissing: true, supplierUnconfirmed: true,
      missingBatchFields: row.pending,
      expiryInterpretation: row.expiryDate ? 'end_of_written_month_utc' : null,
    };
    const quantity = row.createBatch ? row.quantity : 0;
    const price = Number.isFinite(row.sellingPrice) ? row.sellingPrice : 0;
    const product = new Product({
      branchId: branch._id,
      name: [row.nameAsRead, row.strengthAsRead, row.formAsWritten ? `(${row.formAsWritten})` : ''].filter(Boolean).join(' '),
      sku: row.sku, barcode: `INT-${row.sku}`,
      category: 'unclassified', brand: 'Unconfirmed', unit: row.stockUnit || 'unconfirmed',
      contentsDescription: [
        'Kono notebook draft: admin review required before activation.',
        `Source: ${row.sourceLine}.`, row.reviewNotes,
        'Purchase cost not supplied; numeric 0 is provisional. Supplier and manufacturer barcode unconfirmed.',
        'Brand, category and prescription status unconfirmed.',
        row.pending.length ? `Stock not posted: ${row.pending.join('; ')}.` : '',
      ].filter(Boolean).join(' '),
      reorderLevel: 0, maxStockLevel: 0,
      quantityInitial: quantity, quantityAvailable: quantity,
      basePrice: price, suggestedRetailPrice: price, costPrice: 0, markupPercentage: 0,
      requiresPrescription: true, isControlled: false, isActive: false,
      supplierId: supplier._id, expiryDate: row.expiryDate || undefined,
      packSizes: [], createdAt: now, updatedAt: now,
    });
    await product.validate();
    const productObject = product.toObject();
    productObject.importMetadata = metadata;
    products.push(productObject);
    if (!row.createBatch) continue;
    const batch = new Batch({
      branchId: branch._id, productId: product._id, lotNumber: `${row.sku}-OPENING`,
      expiryDate: row.expiryDate, quantityInitial: quantity, quantityAvailable: quantity,
      purchasePrice: 0, sellingPrice: price, supplierId: supplier._id,
      isExpired: row.expiryDate <= now, isDepleted: false, createdAt: now, updatedAt: now,
    });
    await batch.validate();
    batches.push({ ...batch.toObject(), importMetadata: metadata });
    const movement = new Movement({
      branchId: branch._id, productId: product._id, batchId: batch._id,
      quantity, movementType: 'adjustment', userId: actor._id,
      reason: 'Kono notebook opening stock; inactive pending admin review; purchase cost unknown',
      referenceType: 'notebook_opening_stock', timestamp: now,
      metadata, createdAt: now, updatedAt: now,
    });
    await movement.validate();
    movements.push(movement.toObject());
  }
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (existingImport && replaceUnreviewed) {
        await db.collection('products').deleteMany({ 'importMetadata.importId': IMPORT_ID, branchId: branch._id }, { session });
        await db.collection('batches').deleteMany({ 'importMetadata.importId': IMPORT_ID, branchId: branch._id }, { session });
        await db.collection('stockmovements').deleteMany({ 'metadata.importId': IMPORT_ID, branchId: branch._id }, { session });
        await db.collection('inventoryimports').deleteOne({ _id: IMPORT_ID }, { session });
      }
      // Unique receipt makes repeated/concurrent imports safe without overwriting edits.
      await db.collection('inventoryimports').insertOne({
        _id: IMPORT_ID, sourceHash, branchId: branch._id, createdAt: now,
        status: 'pending_admin_review', report,
        productIds: products.map(p => p._id), batchIds: batches.map(b => b._id),
        movementIds: movements.map(m => m._id),
      }, { session });
      await db.collection('products').insertMany(products, { session });
      await db.collection('batches').insertMany(batches, { session });
      await db.collection('stockmovements').insertMany(movements, { session });
    });
  } finally { await session.endSession(); }
  const receipt = { importId: IMPORT_ID, insertedProducts: products.length,
    insertedBatches: batches.length, insertedMovements: movements.length, activeProducts: 0 };
  fs.writeFileSync(path.join(reportDir, 'receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}

main().catch(error => {
  // Avoid logging connection strings or credentials from driver errors.
  console.error(JSON.stringify({ error: error.name, code: error.code,
    message: /mongo|connection|auth|uri/i.test(error.message) ? 'Database operation failed; credentials hidden' : error.message }));
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
