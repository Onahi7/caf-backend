import * as dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config({ path: '.env' });

const EXECUTE_FLAG = 'NORMALIZE_MONROVIA_BRANDS';
const ATLAS_SEEDLIST_FLAG = 'MONGODB_ATLAS_SEEDLIST';
const ATLAS_QUERY_FLAG = 'MONGODB_ATLAS_QUERY';
const WRONG_BRAND = 'Monrovia Opening Stock';
const CORRECT_BRAND = 'Generic';

function db() {
  const database = mongoose.connection.db;
  if (!database) {
    throw new Error('MongoDB connection is not ready');
  }
  return database;
}

function resolveMongoUri(uri: string): string {
  const seedlist = process.env[ATLAS_SEEDLIST_FLAG];
  if (!uri.startsWith('mongodb+srv://') || !seedlist) {
    return uri;
  }

  const parsed = new URL(uri);
  const auth = parsed.username
    ? `${parsed.username}${parsed.password ? `:${parsed.password}` : ''}@`
    : '';
  const query = new URLSearchParams(parsed.search);
  const atlasQuery = process.env[ATLAS_QUERY_FLAG];

  if (atlasQuery) {
    const atlasParams = new URLSearchParams(atlasQuery);
    for (const [key, value] of atlasParams.entries()) {
      if (!query.has(key)) {
        query.set(key, value);
      }
    }
  }

  if (!query.has('ssl') && !query.has('tls')) {
    query.set('tls', 'true');
  }

  const queryText = query.toString();
  return `mongodb://${auth}${seedlist}${parsed.pathname}${queryText ? `?${queryText}` : ''}`;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  const execute = process.env[EXECUTE_FLAG] === 'YES';
  await mongoose.connect(resolveMongoUri(uri), {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  });

  try {
    const monrovia = await db().collection('branches').findOne({
      $or: [
        { code: 'MON' },
        { name: { $regex: '^Monrovia$', $options: 'i' } },
      ],
    });

    if (!monrovia?._id) {
      throw new Error('Monrovia branch was not found');
    }

    const filter = {
      branchId: monrovia._id,
      brand: WRONG_BRAND,
    };
    const matchedCount = await db().collection('products').countDocuments(filter);

    console.log(`Connected to database: ${db().databaseName}`);
    console.log(execute ? 'Mode: EXECUTE' : 'Mode: DRY RUN');
    console.log(
      `${execute ? 'UPDATE' : 'WOULD UPDATE'} ${matchedCount} Monrovia product brand(s) from "${WRONG_BRAND}" to "${CORRECT_BRAND}"`,
    );

    if (execute && matchedCount > 0) {
      const result = await db()
        .collection('products')
        .updateMany(filter, { $set: { brand: CORRECT_BRAND } });
      console.log(`Updated ${result.modifiedCount ?? 0} product brand(s)`);
    }

    if (!execute) {
      console.log(`Set ${EXECUTE_FLAG}=YES to apply the update.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
