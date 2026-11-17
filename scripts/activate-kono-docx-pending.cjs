// Activates all pending Kono docx-sync products (KONO-DX-*) by creating opening
// batches + movements, mirroring activate-kono-stock.cjs conventions.
// Also activates KONO-NBK-072 (Drug Bags) using its docx expiry (12/28).
// KONO-NBK-030 (Microgynon) stays inactive: quantity and price were never recorded.
const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-docx-sync-20261117-v1';
const BRANCH_CODE = 'Kono12';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const now = new Date();

  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE, isActive: true });
  if (!branch) throw new Error(`Active branch ${BRANCH_CODE} not found`);
  const supplier = await db.collection('suppliers').findOne({ name: 'Manual Notebook Import Supplier', isActive: true });
  const actor = await db.collection('users').findOne({ role: 'super_admin', isActive: { $ne: false } }, { projection: { _id: 1 } });

  const pending = await db.collection('products').find({
    branchId: branch._id,
    sku: { $regex: '^KONO-DX-' },
    isActive: { $ne: true },
  }).toArray();
  console.log(`Pending KONO-DX products: ${pending.length}`);

  const drugBags = await db.collection('products').findOne({ branchId: branch._id, sku: 'KONO-NBK-072', isActive: { $ne: true } });
  if (drugBags) {
    await db.collection('products').updateOne(
      { _id: drugBags._id },
      { $set: { expiryDate: new Date('2028-12-31T23:59:59.999Z'), 'importMetadata.docxSync.expiryFromDocx': '12/28', updatedAt: now } },
    );
    drugBags.expiryDate = new Date('2028-12-31T23:59:59.999Z');
    pending.push(drugBags);
    console.log('Including KONO-NBK-072 Drug Bags (expiry set from docx: 12/28)');
  }

  const skipped = [];
  for (const p of pending) {
    const existingBatch = await db.collection('batches').findOne({ branchId: branch._id, productId: p._id });
    let batchId = existingBatch && existingBatch._id;
    if (!existingBatch) {
      if (p.quantityAvailable == null) { skipped.push({ sku: p.sku, reason: 'no quantity recorded' }); continue; }
      const batch = {
        productId: p._id,
        branchId: branch._id,
        lotNumber: `${p.sku}-OPENING`,
        expiryDate: p.expiryDate || null,
        quantityAvailable: p.quantityAvailable,
        quantityInitial: p.quantityAvailable,
        purchasePrice: 0,
        sellingPrice: p.suggestedRetailPrice ?? 0,
        supplierId: supplier._id,
        isExpired: false,
        isDepleted: false,
        createdAt: now,
        updatedAt: now,
        importMetadata: {
          importId: IMPORT_ID,
          sourceHash: p.importMetadata && p.importMetadata.sourceHash,
          original: p.importMetadata && p.importMetadata.original,
          status: 'active',
          noExpiry: !p.expiryDate,
        },
      };
      const res = await db.collection('batches').insertOne(batch);
      batchId = res.insertedId;
      await db.collection('stockmovements').insertOne({
        branchId: branch._id, productId: p._id, batchId,
        quantity: p.quantityAvailable, movementType: 'adjustment',
        reason: `Kono docx ledger opening stock (${IMPORT_ID}); activated by admin`,
        userId: actor._id, referenceType: 'docx_opening_stock', timestamp: now,
        metadata: { importId: IMPORT_ID, sku: p.sku },
        createdAt: now, updatedAt: now,
      });
    }

    await db.collection('products').updateOne(
      { _id: p._id },
      { $set: { isActive: true, 'importMetadata.status': 'active', 'importMetadata.activatedAt': now, updatedAt: now } },
    );
    const dupNote = p.importMetadata && p.importMetadata.possibleDuplicateOf ? ` [possible duplicate of ${p.importMetadata.possibleDuplicateOf}]` : '';
    const expNote = p.expiryDate ? '' : ' [no expiry]';
    console.log(`activated ${p.sku} ${p.name}${dupNote}${expNote}`);
  }

  // Microgynon stays inactive — report it
  const micro = await db.collection('products').findOne({ branchId: branch._id, sku: 'KONO-NBK-030', isActive: { $ne: true } });
  if (micro) console.log(`STILL INACTIVE KONO-NBK-030 ${micro.name}: quantity and price were never recorded in either source`);

  const activeCount = await db.collection('products').countDocuments({ branchId: branch._id, isActive: true });
  const inactiveCount = await db.collection('products').countDocuments({ branchId: branch._id, isActive: false });
  console.log(`\nBranch totals: ${activeCount} active, ${inactiveCount} inactive`);

  await db.collection('inventoryimports').updateOne(
    { _id: IMPORT_ID },
    { $set: { status: 'active', activatedAt: now, 'report.activatedAt': now } },
  );
  await mongoose.disconnect();
}
main().catch(err => { console.error('Activation failed:', err.message); process.exit(1); });
