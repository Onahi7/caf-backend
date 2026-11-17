// Syncs the Medicine_Inventory_List.docx recount into the Kono (Kono12) branch.
// - Updates stock quantities for mapped existing products (+ batch + adjustment movement).
// - Creates unmatched docx rows as inactive products pending admin review (KONO-DX-*).
// - Never modifies names, prices, or expiry dates of existing products; diffs are reported only.
// Dry run by default. Pass --apply to write.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-docx-sync-20261117-v1';
const BRANCH_CODE = 'Kono12';
const sourcePath = path.join(__dirname, 'data', 'kono-docx-20261117.json');
const reportDir = path.resolve(__dirname, '../../outputs/kono-docx-sync-20261117');
const apply = process.argv.includes('--apply');
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

function parseQty(t) {
  const s = String(t || '').trim();
  let m = s.match(/^([\d.]+)\s*(card|pkt|pcs|botts|bottle|vial|cap|tube|roll)/i);
  if (m) return { qty: Number(m[1]), unit: m[2].toLowerCase() };
  m = s.match(/^([\d.]+)\s*s\b/i); if (m) return { qty: Number(m[1]), unit: 'pcs' };
  m = s.match(/^([\d.]+)/); if (m) return { qty: Number(m[1]), unit: '' };
  return { qty: NaN, unit: '' };
}

// Explicit mapping: docx rows -> existing DB SKUs (corrects garbled docx spellings
// and undoes wrong fuzzy matches from the diff pass). null value = deliberately unmatched.
const MAP = {
  'page1-left|1': 'KONO-NBK-035', // Viscof S -> Viscof-S
  'page1-left|2': 'KONO-NBK-002', // Mebendazole
  'page1-left|3': 'KONO-NBK-003', // KofSM - Suck -> Kofan-suck
  'page1-left|4': 'KONO-NBK-004', // Go Cold -> Go-Cold
  'page1-left|5': 'KONO-NBK-006', // ONamul -> Dibumol (same price 5 + exp 10/29)
  'page1-left|6': 'KONO-NBK-007', // Mthigrip -> Mihigrip (qty 1005 suspicious -> review)
  'page1-left|7': 'KONO-NBK-008', // Tridomedocime -> Indomethacin (25 mg, 3, 7/28)
  'page1-left|8': 'KONO-NBK-009', // Compan -> Compain (300 mg, 10, 11/28)
  'page1-left|9': 'KONO-NBK-010', // Penicillin tab
  'page1-left|10': 'KONO-NBK-011', // Metronidazole
  'page1-left|11': 'KONO-NBK-012', // Neutracide
  'page1-left|12': 'KONO-NBK-013', // Broncone-S -> Broncono-F (100 mg, 5, 2/28)
  'page1-left|13': 'KONO-NBK-014', // Chest / lung
  'page1-left|14': 'KONO-NBK-015', // Zinc
  'page1-left|15': 'KONO-NBK-016', // Emzor
  'page1-left|16': 'KONO-NBK-017', // Penadol Extra -> Panadol Extra
  'page1-left|17': 'KONO-NBK-018', // B-Corteu -> Bi-Cortem (500 mg, 20, 2/28)
  'page1-left|18': 'KONO-NBK-019', // Tinidazole
  'page1-left|19': 'KONO-NBK-020', // Bisacodyl
  'page1-left|20': 'KONO-NBK-021', // Reality Expr -> Relief Extra (500 mg, 5, 7/27)
  'page1-left|21': 'KONO-NBK-022', // Olofenac -> Diclofenac 50 mg (4, 5/28)
  'page1-left|22': 'KONO-NBK-023', // Chymotrypsin
  'page1-left|23': 'KONO-NBK-024', // Hemotrin -> Lemotril (5, 3/27); strength 215 vs 2.5 mg noted
  'page1-left|24': 'KONO-NBK-025', // Prednisolone
  'page1-left|25': 'KONO-NBK-026', // Pain out
  'page1-left|26': 'KONO-NBK-028', // Amlodipine
  'page1-left|27': 'KONO-NBK-031', // Ovulation kit -> Ovulation TK
  'page1-left|28': 'KONO-NBK-036', // Naproxen
  'page2|58': 'KONO-NBK-078', // Diclofenac cream
  'page2|59': 'KONO-NBK-080', // Adhesive plaster
  'page2|60': 'KONO-NBK-081', // Pain Plaster
  'page2|61': 'KONO-NBK-082', // Strip Plaster
  'page2|63': 'KONO-NBK-084', // Pain Relief
  'page3|30': 'KONO-NBK-041', // Ampicillin 500 mg (Cap)
  'page3|31': 'KONO-NBK-038', // Ampiclox
  'page3|32': 'KONO-NBK-039', // Doxycycline
  'page3|33': 'KONO-NBK-040', // Tetracycline
  'page3|37': 'KONO-NBK-045', // Antacid
  'page3|42': 'KONO-NBK-056', // Buscopan (amp vs pkt -> review)
  'page3|43': 'KONO-NBK-067', // Omeprazole IV
  'page3|44': 'KONO-NBK-060', // Ciprofloxacin IV -> Cipro IV
  'page3|45': 'KONO-NBK-061', // Butterfly 23G
  'page3|47': 'KONO-NBK-065', // Penicillin 1 MU -> Crystalline Penicillin
  'page3|51': 'KONO-NBK-072', // Drug buy -> Drug Bags
};

// Rows held for manual review despite being mapped: { reason }
const REVIEW = {
  'page1-left|1': 'Syrup counted in docx as "card"; DB unit bottle — manual recount advised',
  'page1-left|6': 'Quantity 1005 suspicious (DB 50); manual recount advised',
  'page3|42': 'DB transcribed 260 amp vs docx 7 pkt — manual recount advised',
  'page1-left|23': 'Strength docx 215 mg vs DB 2.5 mg (Lemotril) — held for review, quantity NOT updated',
};

// Unmapped docx rows become inactive products pending admin review.
const REVIEW_ONLY = {
  'page3|48': 'Possible duplicate of KONO-NBK-065 (Crystalline Penicillin 1 MU); review before merging',
  'page3|50': 'Possible duplicate of KONO-NBK-069 (Penicillin 20 g ointment); review before merging',
};

const NO_RX_FORMS = new Set(['test', '-', 'plaster']);
function needsPrescription(form) { return !NO_RX_FORMS.has(String(form || '').toLowerCase()); }
function normUnit(u) {
  const s = String(u || '').toLowerCase().trim();
  if (s === 'botts' || s === 'bottle') return 'bottle';
  if (s === 's') return 'pcs';
  return s || '';
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const now = new Date();

  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE, isActive: true });
  if (!branch || branch.name !== 'Kono') throw new Error('Expected active Kono branch Kono12');
  const supplier = await db.collection('suppliers').findOne({ name: 'Manual Notebook Import Supplier', isActive: true });
  const actor = await db.collection('users').findOne({ role: 'super_admin', isActive: { $ne: false } }, { projection: { _id: 1 } });
  if (!supplier || !actor) throw new Error('Import supplier and active super admin are required');

  if (apply) {
    const existing = await db.collection('inventoryimports').findOne({ _id: IMPORT_ID });
    if (existing) throw new Error(`Import ${IMPORT_ID} already applied (${existing.createdAt.toISOString()}); refusing to re-apply`);
  }

  const rows = source.map(row => ({ ...row, parsed: parseQty(row.qtyText) }));
  const updates = [];
  const reviewRows = [];
  const creations = [];

  for (const row of rows) {
    const key = `${row.src}|${row.no}`;
    const sku = MAP[key];
    if (!sku) {
      const expiryDate = expiryFromMonth(row.expire);
      const parsed = row.parsed;
      const unit = normUnit(parsed.unit) || 'unit';
      const name = [row.name, row.strength && row.strength !== '-' ? row.strength : null, row.form && row.form !== '-' ? `(${row.form})` : null].filter(Boolean).join(' ');
      creations.push({
        row,
        planned: {
          sku: `KONO-DX-${String(creations.length + 1).padStart(3, '0')}`,
          name,
          unit,
          quantity: Number.isFinite(parsed.qty) ? parsed.qty : null,
          sellingPrice: row.price !== '' && !isNaN(Number(row.price)) ? Number(row.price) : null,
          expiryDate,
          expiryAsWritten: row.expire,
          requiresPrescription: needsPrescription(row.form),
          notes: REVIEW_ONLY[key] || null,
          invalidExpiry: row.expire && !expiryDate ? row.expire : null,
          missingQty: !Number.isFinite(parsed.qty),
        },
      });
      continue;
    }
    const docxQty = row.parsed.qty;
    const reviewReason = REVIEW[key];
    if (reviewReason || !Number.isFinite(docxQty)) {
      reviewRows.push({ key, sku, docxQty, reason: reviewReason || `Quantity "${row.qtyText}" not numeric` });
      continue;
    }
    updates.push({ row, key, sku, docxQty });
  }

  // Preload current state for the report
  const skus = updates.map(u => u.sku);
  const products = await db.collection('products').find({ branchId: branch._id, sku: { $in: skus } }).toArray();
  const productBySku = new Map(products.map(p => [p.sku, p]));
  const batchByProduct = new Map();
  if (products.length) {
    const batches = await db.collection('batches').find({ branchId: branch._id, productId: { $in: products.map(p => p._id) } }).toArray();
    for (const b of batches) batchByProduct.set(String(b.productId), b);
  }

  const plannedUpdates = [];
  for (const u of updates) {
    const p = productBySku.get(u.sku);
    if (!p) { reviewRows.push({ key: u.key, sku: u.sku, docxQty: u.docxQty, reason: 'Mapped SKU not found in DB' }); continue; }
    const before = p.quantityAvailable ?? null;
    const batch = batchByProduct.get(String(p._id));
    const batchBefore = batch ? batch.quantityAvailable ?? null : null;
    const change = before !== null ? u.docxQty - before : null;
    plannedUpdates.push({
      key: u.key, sku: u.sku, productId: p._id, batchId: batch ? batch._id : null,
      name: p.name, before, batchBefore, after: u.docxQty, change,
      docxUnit: normUnit(u.row.parsed.unit) || '(none)', dbUnit: p.unit,
      docxExpiry: u.row.expire, dbExpiry: p.expiryDate ? p.expiryDate.toISOString().slice(0, 10) : null,
      expiryDiffers: !!(u.row.expire && p.expiryDate && expiryFromMonth(u.row.expire) && expiryFromMonth(u.row.expire).toISOString().slice(0, 10) !== p.expiryDate.toISOString().slice(0, 10)),
      docxPrice: u.row.price, dbPrice: p.suggestedRetailPrice,
    });
  }

  const report = {
    importId: IMPORT_ID, sourceHash, apply, at: now.toISOString(),
    database: db.databaseName,
    branch: { id: branch._id, name: branch.name, code: branch.code, currency: branch.currencyCode },
    docxEntries: rows.length,
    plannedUpdates: plannedUpdates.length,
    unchangedRows: plannedUpdates.filter(u => u.change === 0).length,
    plannedCreations: creations.length,
    reviewRows,
    updates: plannedUpdates,
    creations: creations.map(c => ({ key: `${c.row.src}|${c.row.no}`, ...c.planned })),
    policy: {
      names: 'Existing DB product names preserved; docx garbled spellings mapped to their likely DB products',
      scope: 'Only quantityAvailable (product + batch) changes for mapped rows; names, prices and expiry dates untouched',
      newRows: 'Unmapped docx rows stored as inactive products pending admin review (no batch or movement)',
      audit: 'One adjustment stock movement per changed product; previous quantities recorded in movement metadata',
      expiry: 'Docx expiry conflicts reported, never auto-applied',
    },
  };

  console.log(`docx entries: ${rows.length} | planned stock updates: ${report.plannedUpdates} (unchanged: ${report.unchangedRows}) | pending new products: ${report.plannedCreations} | review (no change): ${reviewRows.length}`);

  if (!apply) {
    console.log('\n--- DRY RUN (no writes). Re-run with --apply to commit. ---\n');
    for (const u of plannedUpdates) console.log(`UPDATE ${u.sku} ${u.name}: ${u.before} -> ${u.after} (docx ${u.after} ${u.docxUnit}; db unit ${u.dbUnit}${u.expiryDiffers ? '; expiry differs: docx ' + u.docxExpiry + ' vs db ' + u.dbExpiry : ''})`);
    for (const r of reviewRows) console.log(`REVIEW ${r.key} ${r.sku || ''}: ${r.reason}`);
    for (const c of report.creations) console.log(`CREATE ${c.sku} ${c.name}: qty ${c.quantity} ${c.unit}, price ${c.sellingPrice}, exp ${c.expiryDate ? c.expiryDate.toISOString().slice(0, 10) : (c.invalidExpiry ? `INVALID(${c.invalidExpiry})` : 'none')}${c.notes ? ' | ' + c.notes : ''}`);
  } else {
    let updated = 0, movements = 0, created = 0;
    const updatedIds = [], movementIds = [], createdIds = [];
    for (const u of plannedUpdates) {
      if (u.change === 0) continue;
      const prev = { product: u.before, batch: u.batchBefore };
      await db.collection('products').updateOne(
        { _id: u.productId },
        {
          $set: {
            quantityAvailable: u.after,
            updatedAt: now,
            'importMetadata.docxSync': {
              importId: IMPORT_ID, docxRow: u.key, docxQty: u.after, docxUnit: u.docxUnit,
              previousQuantity: u.before, previousBatchQuantity: u.batchBefore, syncedAt: now,
            },
          },
        },
      );
      if (u.batchId) {
        await db.collection('batches').updateOne(
          { _id: u.batchId },
          {
            $set: {
              quantityAvailable: u.after,
              isDepleted: u.after > 0 ? false : undefined,
              updatedAt: now,
              'importMetadata.docxSync': {
                importId: IMPORT_ID, docxRow: u.key, docxQty: u.after,
                previousQuantity: u.batchBefore, syncedAt: now,
              },
            },
          },
        );
        const mv = {
          branchId: branch._id, productId: u.productId, batchId: u.batchId,
          quantity: u.change, movementType: 'adjustment',
          reason: `Kono docx ledger recount (${IMPORT_ID}); previous product qty ${prev.product}, batch qty ${prev.batch}`,
          userId: actor._id, referenceType: 'docx_stock_sync', timestamp: now,
          metadata: { importId: IMPORT_ID, sourceHash, docxRow: u.key, docxQty: u.after, docxUnit: u.docxUnit, previous: prev },
          createdAt: now, updatedAt: now,
        };
        const res = await db.collection('stockmovements').insertOne(mv);
        movementIds.push(res.insertedId);
        movements++;
      }
      updatedIds.push(u.productId);
      updated++;
    }
    for (const c of creations) {
      const p = c.planned;
      const doc = {
        branchId: branch._id,
        name: p.name,
        sku: p.sku,
        barcode: `INT-${p.sku}`,
        category: 'unclassified',
        brand: 'Unconfirmed',
        unit: p.unit,
        contentsDescription: `Kono docx ledger draft (Medicine_Inventory_List.docx, ${c.row.src} row ${c.row.no}): admin review required before activation.${p.notes ? ' ' + p.notes : ''}${p.invalidExpiry ? ` Expiry "${p.invalidExpiry}" as written is invalid and was not set.` : ''} Purchase cost not supplied; numeric 0 is provisional. Supplier and manufacturer barcode unconfirmed.`,
        reorderLevel: 0,
        maxStockLevel: 0,
        quantityAvailable: p.quantity ?? 0,
        quantityInitial: p.quantity ?? 0,
        basePrice: p.sellingPrice ?? 0,
        costPrice: 0,
        suggestedRetailPrice: p.sellingPrice ?? 0,
        markupPercentage: 0,
        requiresPrescription: p.requiresPrescription,
        isControlled: false,
        isActive: false,
        supplierId: supplier._id,
        expiryDate: p.expiryDate,
        packSizes: [],
        createdAt: now,
        updatedAt: now,
        importMetadata: {
          importId: IMPORT_ID,
          sourceHash,
          original: {
            src: c.row.src, row: c.row.no, nameAsRead: c.row.name, formAsWritten: c.row.form,
            strengthAsRead: c.row.strength, quantity: p.quantity, stockUnit: p.unit,
            sellingPrice: p.sellingPrice, expiryAsWritten: c.row.expire,
          },
          status: 'pending_admin_review',
          source: 'Medicine_Inventory_List.docx',
          possibleDuplicateOf: (REVIEW_ONLY[`${c.row.src}|${c.row.no}`] || '').startsWith('Possible duplicate') ? (REVIEW_ONLY[`${c.row.src}|${c.row.no}`].match(/KONO-NBK-\d+/) || [null])[0] : null,
          missingQty: p.missingQty,
        },
      };
      const res = await db.collection('products').insertOne(doc);
      createdIds.push(res.insertedId);
      created++;
    }
    const importDoc = {
      _id: IMPORT_ID,
      sourceHash,
      branchId: branch._id,
      createdAt: now,
      status: 'applied',
      report: { ...report, apply: true },
      updatedProductIds: updatedIds,
      movementIds,
      createdProductIds: createdIds,
      counts: { productsUpdated: updated, movementsCreated: movements, productsCreated: created, reviewRows: reviewRows.length },
    };
    await db.collection('inventoryimports').insertOne(importDoc);

    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(path.join(reportDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(`\nAPPLIED: ${updated} products updated, ${movements} movements, ${created} pending products created, ${reviewRows.length} rows left for review`);
    console.log(`report: outputs/kono-docx-sync-20261117/report.json`);
  }
  await mongoose.disconnect();
}
main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
