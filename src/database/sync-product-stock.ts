/**
 * Sync product quantityAvailable from batch totals.
 * 
 * Run: npx ts-node --esm src/database/sync-product-stock.ts
 * 
 * This fixes the data mismatch where batches were imported
 * but product.quantityAvailable was never updated.
 */

import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://mmmnigeriaschool12_db_user:Iamhardy_7%2A@cluster0.abdi7yt.mongodb.net/carefaam?retryWrites=true&w=majority&appName=Cluster0&ssl=true&authSource=admin';

async function sync() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('Connected.\n');

  const db = mongoose.connection.db!;
  const batches = db.collection('batches');
  const products = db.collection('products');

  // Step 1: Aggregate batch quantities per product per branch
  console.log('Step 1: Aggregating batch quantities...');
  const batchTotals = await batches.aggregate([
    {
      $group: {
        _id: {
          productId: '$productId',
          branchId: '$branchId',
        },
        totalQuantity: { $sum: '$quantityAvailable' },
        batchCount: { $sum: 1 },
      },
    },
  ]).toArray();

  console.log(`Found ${batchTotals.length} product-branch combinations with batches.\n`);

  // Step 2: Bulk update products
  console.log('Step 2: Bulk updating product quantityAvailable...');
  
  const bulkOps = batchTotals.map((batch: any) => {
    const productId = batch._id.productId;
    const branchId = batch._id.branchId;
    const newQuantity = batch.totalQuantity;
    
    return {
      updateOne: {
        filter: {
          _id: new mongoose.Types.ObjectId(productId),
          branchId: {
            $in: [
              new mongoose.Types.ObjectId(branchId),
              branchId,
            ],
          },
        },
        update: {
          $set: {
            quantityAvailable: newQuantity,
            stock: newQuantity,
            stockAvailable: newQuantity,
          },
        },
      },
    };
  });

  if (bulkOps.length > 0) {
    const bulkResult = await products.bulkWrite(bulkOps, { ordered: false });
    console.log(`  Updated ${bulkResult.modifiedCount} products`);
  }

  // Step 3: Summary
  console.log('\n=== SYNC COMPLETE ===');
  console.log(`  Updated: ${bulkOps.length} products from batch totals`);

  // Step 4: Show sample results
  console.log('\n=== Sample Results ===');
  const samples = await products.find({ quantityAvailable: { $gt: 0 } }).limit(10).toArray();
  for (const p of samples) {
    console.log(`  ${p.name} (${p.sku}) -> stock: ${p.quantityAvailable} | price: ${p.suggestedRetailPrice || p.basePrice || 0}`);
  }

  await mongoose.disconnect();
  console.log('\nDone.');
}

sync().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
