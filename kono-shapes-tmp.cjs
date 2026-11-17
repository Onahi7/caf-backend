const mongoose = require('mongoose');
require('dotenv').config({ path: require('node:path').join(__dirname, '.env'), quiet: true });
async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000, autoIndex: false, autoCreate: false });
  const db = mongoose.connection.db;
  const branch = await db.collection('branches').findOne({ code: 'Kono12' });
  const m = await db.collection('stockmovements').findOne({ branchId: branch._id });
  console.log('movement:', JSON.stringify(m, null, 1));
  const b = await db.collection('batches').findOne({ branchId: branch._id });
  console.log('kono batch:', JSON.stringify(b, null, 1));
  const p = await db.collection('products').findOne({ sku: 'KONO-NBK-007' });
  console.log('mihigrip product:', JSON.stringify(p, null, 1));
  const im = await db.collection('inventoryimports').findOne({ _id: 'kono-notebook-20261017-v1' });
  console.log('import doc keys sample:', JSON.stringify({ report: im.report, activeProducts: im.activeProducts }, null, 1).slice(0, 1500));
  await mongoose.disconnect();
}
main().catch(e => { console.error(e.message); process.exit(1); });
