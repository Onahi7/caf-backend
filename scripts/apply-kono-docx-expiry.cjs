// Applies admin-approved expiry corrections from the Medicine_Inventory_List.docx
// recount to the 10 products whose DB expiry conflicted with the docx ledger.
// Expiry is interpreted as the end of the written month in UTC (same rule as the
// notebook import). Batch isExpired is recalculated; quantities are untouched.
// Dry run by default. Pass --apply to write.
const path = require('node:path');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-docx-sync-20261117-v1';
const BRANCH_CODE = 'Kono12';

// docxRow -> { sku, docxExpiry } (from sync report: expiryDiffers rows)
const FIXES = [
  { docxRow: 'page1-left|11', sku: 'KONO-NBK-012', docxExpiry: '4/28' },  // Neutracide (db 11/28)
  { docxRow: 'page2|58', sku: 'KONO-NBK-078', docxExpiry: '6/28' },      // Diclofenac cream (db 3/28)
  { docxRow: 'page2|59', sku: 'KONO-NBK-080', docxExpiry: '12/29' },     // Adhesive plaster (db 6/28)
  { docxRow: 'page3|30', sku: 'KONO-NBK-041', docxExpiry: '7/27' },      // Ampicillin (db 11/26 — batch currently expired-flagged)
  { docxRow: 'page3|31', sku: 'KONO-NBK-038', docxExpiry: '9/28' },      // Ampiclox (db 7/27)
  { docxRow: 'page3|32', sku: 'KONO-NBK-039', docxExpiry: '8/28' },      // Doxycycline (db 9/28)
  { docxRow: 'page3|37', sku: 'KONO-NBK-045', docxExpiry: '10/28' },     // Antacid (db 6/28)
  { docxRow: 'page3|43', sku: 'KONO-NBK-067', docxExpiry: '12/28' },     // Omeprazole (db 8/28)
  { docxRow: 'page3|44', sku: 'KONO-NBK-060', docxExpiry: '4/29' },      // Cipro IV (db 12/28)
  { docxRow: 'page3|45', sku: 'KONO-NBK-061', docxExpiry: '12/27' },     // Butterfly (db 7/30)
];

function expiryFromMonth(text) {
  const match = String(text || '').match(/^(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
}

const apply = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const now = new Date();
  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE });

  const plans = [];
  for (const f of FIXES) {
    const expiryDate = expiryFromMonth(f.docxExpiry);
    if (!expiryDate) throw new Error(`Invalid expiry ${f.docxExpiry} for ${f.sku}`);
    const p = await db.collection('products').findOne({ branchId: branch._id, sku: f.sku });
    if (!p) throw new Error(`Product ${f.sku} not found`);
    const batch = await db.collection('batches').findOne({ branchId: branch._id, productId: p._id });
    plans.push({
      ...f,
      expiryDate,
      newExpiry: expiryDate.toISOString().slice(0, 10),
      productExpiryBefore: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
      batchExpiryBefore: batch && batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : null,
      batchId: batch && batch._id,
      batchWasExpired: !!(batch && batch.isExpired),
      willBeExpired: expiryDate < now,
    });
  }

  console.log(`planned expiry corrections: ${plans.length}`);
  for (const pl of plans) {
    console.log(`${pl.sku} (${pl.docxRow}): product ${pl.productExpiryBefore} -> ${pl.newExpiry}${pl.batchId ? `; batch ${pl.batchExpiryBefore} -> ${pl.newExpiry}` : '; no batch'}${pl.willBeExpired ? ' [still expired]' : pl.batchWasExpired ? ' [un-flags expired batch]' : ''}`);
  }

  if (!apply) {
    console.log('\n--- DRY RUN (no writes). Re-run with --apply to commit. ---');
    await mongoose.disconnect();
    return;
  }

  for (const pl of plans) {
    const resolution = { docxRow: pl.docxRow, docxExpiry: pl.docxExpiry, previousExpiry: pl.productExpiryBefore, resolvedAt: now };
    await db.collection('products').updateOne(
      { _id: (await db.collection('products').findOne({ branchId: branch._id, sku: pl.sku }, { projection: { _id: 1 } }))._id },
      { $set: { expiryDate: pl.expiryDate, updatedAt: now, 'importMetadata.docxSync.expiryResolution': resolution } },
    );
    if (pl.batchId) {
      await db.collection('batches').updateOne(
        { _id: pl.batchId },
        {
          $set: {
            expiryDate: pl.expiryDate,
            isExpired: pl.willBeExpired,
            updatedAt: now,
            'importMetadata.docxSync.expiryResolution': { ...resolution, previousExpiry: pl.batchExpiryBefore },
          },
        },
      );
    }
  }

  await db.collection('inventoryimports').updateOne(
    { _id: IMPORT_ID },
    {
      $set: {
        'report.expiryResolutions': plans.map(pl => ({ sku: pl.sku, docxExpiry: pl.docxExpiry, newExpiry: pl.newExpiry, previousExpiry: pl.productExpiryBefore })),
        'report.expiryResolvedAt': now,
      },
    },
  );
  console.log(`\nAPPLIED: ${plans.length} expiry corrections (products + batches), import record updated`);
  await mongoose.disconnect();
}
main().catch(err => { console.error('ERROR:', err.message); process.exit(1); });
