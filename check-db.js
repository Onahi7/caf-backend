const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

// Read and parse .env file manually
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found');
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...vals] = trimmed.split('=');
      if (key && vals.length) {
        process.env[key.trim()] = vals.join('=').trim();
      }
    }
  }
}

loadEnv();

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('❌ MONGODB_URI not found in .env');
  process.exit(1);
}

async function checkDB() {
  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB Atlas via Mongoose');
    const db = mongoose.connection.db;

    // List collections
    const collections = await db.listCollections().toArray();
    console.log('\n📚 Collections:');
    collections.forEach(col => console.log(`  - ${col.name}`));

    // Check receipt counter
    const counters = db.collection('counters');
    const counterDoc = await counters.findOne({ _id: 'receipt_number' });
    console.log('\n🔢 Receipt Counter:');
    console.log(counterDoc ? `  Current: ${counterDoc.seq}` : '  ⚠️ Not found');

    // Recent sales
    const sales = db.collection('sales');
    const recentSales = await sales.find().sort({ createdAt: -1 }).limit(3).toArray();
    console.log('\n🛒 Recent Sales:');
    if (recentSales.length) {
      recentSales.forEach(s => console.log(`  - ${s.receiptNumber || s._id}`));
    } else {
      console.log('  No sales');
    }

    // Active shifts
    const shifts = db.collection('shifts');
    const activeShifts = await shifts.find({ status: 'open' }).toArray();
    console.log('\n🔓 Active Shifts:');
    if (activeShifts.length) {
      activeShifts.forEach(s => console.log(`  - Shift ${s._id}`));
    } else {
      console.log('  None');
    }

    // Product count
    const products = db.collection('products');
    const productCount = await products.countDocuments();
    console.log(`\n📦 Total Products: ${productCount}`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    if (err.message.includes('password') || err.message.includes('URI')) {
      console.log('⚠️ Tip: Ensure * in password is encoded as %2A');
    }
  } finally {
    await mongoose.disconnect();
  }
}

checkDB();
