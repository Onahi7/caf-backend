const mongoose = require('mongoose');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const IMPORT_ID = 'kono-notebook-20261017-v1';
const BRANCH_CODE = 'Kono12';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required');

  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 15000,
  });

  const db = mongoose.connection.db;
  const branch = await db.collection('branches').findOne({ code: BRANCH_CODE, isActive: true });
  if (!branch) throw new Error(`Active branch ${BRANCH_CODE} not found`);

  console.log(`Connecting to database: ${db.databaseName}`);
  console.log(`Target branch: ${branch.name} (${branch.code})`);

  // Find all batches for this import
  const batches = await db.collection('batches').find({
    branchId: branch._id,
    'importMetadata.importId': IMPORT_ID,
  }).toArray();

  const batchedProductIds = new Set(batches.map(b => String(b.productId)));
  console.log(`Found ${batches.length} opening batches associated with import ${IMPORT_ID}`);

  // Find all products for this import
  const importProducts = await db.collection('products').find({
    branchId: branch._id,
    'importMetadata.importId': IMPORT_ID,
  }).toArray();

  console.log(`Found ${importProducts.length} products for this import`);

  const toActivate = [];
  const toKeepInactive = [];

  for (const product of importProducts) {
    if (batchedProductIds.has(String(product._id))) {
      toActivate.push(product._id);
    } else {
      toKeepInactive.push({ sku: product.sku, name: product.name });
    }
  }

  console.log(`Products to activate (with batches): ${toActivate.length}`);
  console.log(`Products remaining inactive (without batches): ${toKeepInactive.length}`);
  toKeepInactive.forEach(p => console.log(`  - ${p.sku}: ${p.name}`));

  const now = new Date();

  // Activate batched products
  const updateResult = await db.collection('products').updateMany(
    { _id: { $in: toActivate } },
    {
      $set: {
        isActive: true,
        'importMetadata.status': 'active',
        'importMetadata.activatedAt': now,
        updatedAt: now,
      },
    }
  );

  console.log(`\nSuccessfully updated ${updateResult.modifiedCount} products to isActive: true`);

  // Update the inventory import receipt
  await db.collection('inventoryimports').updateOne(
    { _id: IMPORT_ID },
    {
      $set: {
        status: 'active',
        activeProducts: updateResult.modifiedCount,
        activatedAt: now,
      },
    }
  );

  // Verification queries
  const activeCount = await db.collection('products').countDocuments({
    branchId: branch._id,
    isActive: true,
  });

  const inactiveCount = await db.collection('products').countDocuments({
    branchId: branch._id,
    isActive: false,
  });

  console.log('\n--- Final Branch Product Status ---');
  console.log(`Total Active Products for ${branch.name}: ${activeCount}`);
  console.log(`Total Inactive Products for ${branch.name}: ${inactiveCount}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Activation failed:', err);
  process.exit(1);
});
