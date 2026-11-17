// Applies the admin-confirmed resolutions for the kono-docx-sync-20261117-v1 review rows.
// Resolutions confirmed by the user on 2026-11-17:
//   KONO-NBK-035 Viscof-S        -> 7 bottles (docx "7 card" unit was a mis-transcription)
//   KONO-NBK-007 Mihigrip        -> 105 (docx "1005" was a mis-read)
//   KONO-NBK-024 Lemotril        -> identity confirmed (2.5 mg); docx qty 45 applied
//   KONO-NBK-056 Buscopan        -> no change; DB 260 amp confirmed correct, docx "7 pkt" is a separate tablets line (not created)
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-docx-sync-20261117-v1';
const BRANCH_CODE = 'Kono12';
const RESOLUTIONS = [
  { sku: 'KONO-NBK-035', name: 'Viscof-S', qty: 7, docxRow: 'page1-left|1', note: 'User confirmed 7 bottles; docx unit "card" was a mis-transcription.' },
  { sku: 'KONO-NBK-007', name: 'Mihigrip', qty: 105, docxRow: 'page1-left|6', note: 'User confirmed 105; docx "1005" was a mis-read.' },
  { sku: 'KONO-NBK-024', name: 'Lemotril', qty: 45, docxRow: 'page1-left|23', note: 'User confirmed product identity (2.5 mg Lemotril); docx quantity 45 applied.' },
];
const NO_CHANGE = [
  { sku: 'KONO-NBK-056', docxRow: 'page3|42', note: 'User confirmed DB 260 amp (injection) is correct; docx "7 pkt" is a separate tablets line, not created.' },
];

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const now = new Date();
  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE });
  const actor = await db.collection('users').findOne({ role: 'super_admin', isActive: { $ne: false } }, { projection: { _id: 1 } });

  for (const r of RESOLUTIONS) {
    const p = await db.collection('products').findOne({ branchId: branch._id, sku: r.sku });
    if (!p) throw new Error(`Product ${r.sku} not found`);
    const before = p.quantityAvailable ?? null;
    const batch = await db.collection('batches').findOne({ branchId: branch._id, productId: p._id });
    const batchBefore = batch ? batch.quantityAvailable ?? null : null;
    const change = r.qty - before;

    await db.collection('products').updateOne(
      { _id: p._id },
      { $set: { quantityAvailable: r.qty, updatedAt: now, 'importMetadata.docxSync.reviewResolution': { docxRow: r.docxRow, resolvedQty: r.qty, note: r.note, resolvedAt: now } } },
    );
    if (batch) {
      await db.collection('batches').updateOne(
        { _id: batch._id },
        { $set: { quantityAvailable: r.qty, updatedAt: now, 'importMetadata.docxSync.reviewResolution': { docxRow: r.docxRow, resolvedQty: r.qty, previousQuantity: batchBefore, resolvedAt: now } } },
      );
      const mv = {
        branchId: branch._id, productId: p._id, batchId: batch._id,
        quantity: change, movementType: 'adjustment',
        reason: `Kono docx recount review resolution (${IMPORT_ID}); previous qty ${before}`,
        userId: actor._id, referenceType: 'docx_stock_review', timestamp: now,
        metadata: { importId: IMPORT_ID, docxRow: r.docxRow, resolvedQty: r.qty, previous: { product: before, batch: batchBefore }, note: r.note },
        createdAt: now, updatedAt: now,
      };
      await db.collection('stockmovements').insertOne(mv);
    }
    console.log(`${r.sku} ${r.name}: ${before} -> ${r.qty}`);
  }

  await db.collection('inventoryimports').updateOne(
    { _id: IMPORT_ID },
    {
      $set: {
        'report.reviewResolutions': RESOLUTIONS.map(r => ({ sku: r.sku, qty: r.qty, note: r.note })),
        'report.noChangeResolutions': NO_CHANGE.map(r => ({ sku: r.sku, note: r.note })),
        'report.reviewResolvedAt': now,
      },
    },
  );
  console.log('import record updated with resolutions');
  await mongoose.disconnect();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
