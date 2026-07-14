import * as dotenv from 'dotenv';
import mongoose, { Types } from 'mongoose';

dotenv.config({ path: '.env' });

const APPLY_FLAG = 'RECONCILE_OPERATIONS';

function database() {
  const value = mongoose.connection.db;
  if (!value) throw new Error('MongoDB connection is not ready');
  return value;
}

function resolveMongoUri(uri: string): string {
  const seedlist = process.env.MONGODB_ATLAS_SEEDLIST;
  if (!uri.startsWith('mongodb+srv://') || !seedlist) return uri;
  const parsed = new URL(uri);
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
    : '';
  const query = new URLSearchParams(parsed.search);
  const extra = new URLSearchParams(process.env.MONGODB_ATLAS_QUERY || '');
  for (const [key, value] of extra.entries()) if (!query.has(key)) query.set(key, value);
  if (!query.has('ssl') && !query.has('tls')) query.set('tls', 'true');
  return `mongodb://${auth}${seedlist}${parsed.pathname}?${query.toString()}`;
}

function inferDirection(entry: Record<string, any>): 'inflow' | 'outflow' {
  if (entry.type === 'income') return 'inflow';
  const text = `${entry.description || ''} ${entry.notes || ''}`.toLowerCase();
  if (entry.type === 'advance' && text.includes('repay')) return 'inflow';
  if (entry.type === 'loan' && (text.includes('received') || text.includes('repayment received'))) return 'inflow';
  return 'outflow';
}

async function reconcileSaleLines(apply: boolean) {
  const sales = database().collection('sales');
  const cursor = sales.find({ items: { $elemMatch: { $or: [{ saleItemId: { $exists: false } }, { saleItemId: '' }] } } });
  let documents = 0;
  let lines = 0;
  for await (const sale of cursor) {
    const items = (sale.items || []).map((item: Record<string, any>) => {
      if (item.saleItemId) return item;
      lines += 1;
      return { ...item, saleItemId: new Types.ObjectId().toString() };
    });
    documents += 1;
    if (apply) await sales.updateOne({ _id: sale._id }, { $set: { items } });
  }
  return { documents, lines };
}

async function reconcileCashDirections(apply: boolean) {
  const entries = database().collection('cashentries');
  const cursor = entries.find({ $or: [{ cashFlowDirection: { $exists: false } }, { cashFlowDirection: null }] });
  let updated = 0;
  let disabledAccruals = 0;
  for await (const entry of cursor) {
    const isAccrual = entry.type === 'loan' && String(entry.description || '').toLowerCase().includes('interest accrued');
    if (apply) {
      await entries.updateOne(
        { _id: entry._id },
        isAccrual
          ? { $set: { isActive: false, notes: `${entry.notes || ''} [disabled by reconciliation: non-cash accrual]`.trim() } }
          : { $set: { cashFlowDirection: inferDirection(entry) } },
      );
    }
    if (isAccrual) disabledAccruals += 1;
    else updated += 1;
  }
  return { updated, disabledAccruals };
}

async function reconcileLegacyAssignments(apply: boolean) {
  const assignments = database().collection('marketerproductassignments');
  const batches = database().collection('batches');
  const cursor = assignments.find({
    isActive: true,
    remainingQuantity: { $gt: 0 },
    $or: [{ batchAllocations: { $exists: false } }, { batchAllocations: { $size: 0 } }],
  });
  let found = 0;
  let reconciled = 0;
  let insufficient = 0;
  for await (const assignment of cursor) {
    found += 1;
    const candidates = await batches.find({
      branchId: assignment.branchId,
      productId: assignment.productId,
      quantityAvailable: { $gt: 0 },
      isExpired: false,
      isDepleted: false,
      expiryDate: { $gt: new Date() },
    }).sort({ expiryDate: 1 }).toArray();
    let remaining = assignment.remainingQuantity;
    const allocations: Array<{ batchId: Types.ObjectId; quantity: number; remainingQuantity: number }> = [];
    for (const batch of candidates) {
      if (remaining <= 0) break;
      const quantity = Math.min(remaining, batch.quantityAvailable);
      allocations.push({ batchId: batch._id, quantity, remainingQuantity: quantity });
      remaining -= quantity;
    }
    if (remaining > 0) {
      insufficient += 1;
      continue;
    }
    reconciled += 1;
    if (apply) {
      const session = await mongoose.connection.startSession();
      try {
        await session.withTransaction(async () => {
          for (const allocation of allocations) {
            const result = await batches.updateOne(
              { _id: allocation.batchId, quantityAvailable: { $gte: allocation.quantity } },
              { $inc: { quantityAvailable: -allocation.quantity } },
              { session },
            );
            if (result.modifiedCount !== 1) throw new Error('Batch changed during marketer reconciliation');
          }
          await assignments.updateOne({ _id: assignment._id }, { $set: { batchAllocations: allocations } }, { session });
        });
      } finally {
        await session.endSession();
      }
    }
  }
  return { found, reconciled, insufficient };
}

async function reconcileProductTotals(apply: boolean) {
  const products = database().collection('products');
  const totals = await database().collection('batches').aggregate([
    { $match: { isExpired: false, isDepleted: false, expiryDate: { $gt: new Date() }, quantityAvailable: { $gt: 0 } } },
    { $group: { _id: { branchId: '$branchId', productId: '$productId' }, quantity: { $sum: '$quantityAvailable' } } },
  ]).toArray();
  const totalByProduct = new Map(totals.map((row) => [`${row._id.branchId}:${row._id.productId}`, row.quantity]));
  let mismatches = 0;
  let absoluteDelta = 0;
  for await (const product of products.find({})) {
    const expected = totalByProduct.get(`${product.branchId}:${product._id}`) || 0;
    const current = product.quantityAvailable || 0;
    if (current === expected) continue;
    mismatches += 1;
    absoluteDelta += Math.abs(expected - current);
    if (apply) await products.updateOne({ _id: product._id }, { $set: { quantityAvailable: expected } });
  }
  return { mismatches, absoluteDelta };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');
  const apply = process.env[APPLY_FLAG] === 'YES';
  await mongoose.connect(resolveMongoUri(uri), { serverSelectionTimeoutMS: 30000 });
  try {
    console.log(`Operational reconciliation: ${apply ? 'APPLY' : 'DRY RUN'}`);
    if (apply) {
      const preflight = await reconcileLegacyAssignments(false);
      if (preflight.insufficient > 0) {
        throw new Error(
          `Apply blocked: ${preflight.insufficient} active legacy marketer assignment(s) cannot be tied to sufficient source-batch stock`,
        );
      }
    }
    console.log('Sale line identifiers:', await reconcileSaleLines(apply));
    console.log('Cash directions:', await reconcileCashDirections(apply));
    console.log('Legacy marketer assignments:', await reconcileLegacyAssignments(apply));
    console.log('Product/batch totals:', await reconcileProductTotals(apply));
    if (!apply) console.log(`Set ${APPLY_FLAG}=YES to apply these repairs.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
