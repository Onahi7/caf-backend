const path = require('node:path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const zones = [
  {
    code: 'WEST',
    name: 'West Zone',
    city: 'Freetown',
    neighbourhoods: [
      'Aberdeen', 'Lumley', 'Goderich', 'Juba', 'Wilkinson Road', 'Congo Cross',
      'Hill Station', 'Spur Road', 'Murray Town', 'Cape Sierra', 'Cockle Bay',
      'Signal Hill', 'western Pipeline', 'Tengbeh Town west of the agreed line',
    ],
    priorityFacilities: [
      'Lumley-Aberdeen private clinics and pharmacies',
      'Goderich / Juba facilities',
      'western hospital and maternity sites',
      'hotel and embassy-belt clinics',
    ],
  },
  {
    code: 'CENTRAL',
    name: 'Central Zone',
    city: 'Freetown',
    neighbourhoods: [
      'Downtown / CBD', 'Siaka Stevens Street', 'Rawdon', 'Garrison Street',
      'Pademba Road', 'Tower Hill', 'Cotton Tree', 'Government Wharf', 'Kingtom',
      'Brookfields', 'New England', 'Kroo Town Road / Kroo Bay edge', 'Congo Town east of the West line',
      'Cline Town west of the East line',
    ],
    priorityFacilities: [
      'Central Freetown hospitals and busy private clinics',
      'Brookfields / New England facilities',
      'downtown pharmacies',
      'Kingtom and Tower Hill sites',
    ],
  },
  {
    code: 'EAST',
    name: 'East Zone',
    city: 'Freetown',
    neighbourhoods: [
      'Kissy', 'Cline Town east of the agreed line', 'Ferry Junction', 'Wellington',
      'Calaba Town', 'Allen Town', 'Grassfield', 'Portee', 'Rokupa', 'Thunder Hill',
      'Old Railway Line east', 'Ross Road / Fourah Bay east cluster',
    ],
    priorityFacilities: [
      'Kissy and Wellington hospitals and CHCs',
      'Calaba Town / Allen Town clinics and pharmacies',
      'Ferry Junction shops',
      'Portee-Rokupa maternity and private rooms',
    ],
  },
];

const visitTypes = [
  ['NEW', 'New first visit', 'Register card complete or it did not happen'],
  ['DEMO', 'Product or protocol demonstration', 'Named next step and date'],
  ['SALE', 'Sale', 'Order taken and paid, or paid in part with chit; receipt and stock out'],
  ['REST', 'Restock', 'Count what is left on the shelf before selling more'],
  ['COL', 'Collection', 'Cash in, chit closed, or new written date'],
  ['HRB', 'Harbor partnership', 'Pad left, or first patients named'],
  ['TRN', 'On-site training', 'Attendance list, even if only two people'],
  ['DEAD', 'Closed / hostile / not a buyer', 'Reason logged so the route stops wasting time'],
];

async function ensureCollection(db, name) {
  const exists = await db.listCollections({ name }).hasNext();
  if (!exists) await db.createCollection(name);
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is required');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 30000 });
  const db = mongoose.connection.db;
  if (!db) throw new Error('Mongo database connection is not ready');

  for (const collection of ['fieldzones', 'fieldvisittypes', 'facilities', 'fieldvisits', 'dailyfieldreports']) {
    await ensureCollection(db, collection);
  }

  const zoneCollection = db.collection('fieldzones');
  const visitTypeCollection = db.collection('fieldvisittypes');
  for (const zone of zones) {
    await zoneCollection.updateOne(
      { code: zone.code },
      { $setOnInsert: { ...zone, isActive: true, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
  }

  for (const [index, [code, label, exitRule]] of visitTypes.entries()) {
    await visitTypeCollection.updateOne(
      { code },
      { $setOnInsert: { code, label, exitRule, sortOrder: index, isActive: true, createdAt: new Date(), updatedAt: new Date() } },
      { upsert: true },
    );
  }

  await zoneCollection.createIndex({ code: 1 }, { unique: true, name: 'field_zone_code_unique' });
  await zoneCollection.createIndex({ city: 1, isActive: 1 }, { name: 'field_zone_city_active' });
  await visitTypeCollection.createIndex({ code: 1 }, { unique: true, name: 'field_visit_type_code_unique' });
  await visitTypeCollection.createIndex({ sortOrder: 1 }, { name: 'field_visit_type_order' });
  await db.collection('facilities').createIndex({ branchId: 1, zoneCode: 1, name: 1 }, { name: 'facility_branch_zone_name' });
  await db.collection('facilities').createIndex({ assignedMarketerId: 1, nextVisitAt: 1 }, { name: 'facility_marketer_next_visit' });
  await db.collection('fieldvisits').createIndex({ marketerId: 1, visitedAt: -1 }, { name: 'visit_marketer_date' });
  await db.collection('fieldvisits').createIndex({ facilityId: 1, visitedAt: -1 }, { name: 'visit_facility_date' });
  await db.collection('dailyfieldreports').createIndex({ marketerId: 1, reportDate: 1 }, { unique: true, name: 'daily_report_marketer_date' });
  await db.collection('dailyfieldreports').createIndex({ branchId: 1, reportDate: -1 }, { name: 'daily_report_branch_date' });

  console.log(JSON.stringify({
    database: db.databaseName,
    collections: ['fieldzones', 'fieldvisittypes', 'facilities', 'fieldvisits', 'dailyfieldreports'],
    zones: await zoneCollection.countDocuments(),
    visitTypes: await visitTypeCollection.countDocuments(),
    facilities: await db.collection('facilities').countDocuments(),
    visits: await db.collection('fieldvisits').countDocuments(),
    dailyReports: await db.collection('dailyfieldreports').countDocuments(),
  }, null, 2));
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Field seed failed');
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
