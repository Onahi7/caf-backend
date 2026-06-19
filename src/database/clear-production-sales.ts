import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

dotenv.config({ path: '.env' });

type CollectionPlan = {
  name: string;
  filter: Record<string, unknown>;
  description: string;
};

const EXECUTE_FLAG = 'CLEAR_PRODUCTION_SALES';
const MONROVIA_BRAND_FLAG = 'MONROVIA_NORMALIZE_BRANDS';
const ATLAS_SEEDLIST_FLAG = 'MONGODB_ATLAS_SEEDLIST';
const ATLAS_QUERY_FLAG = 'MONGODB_ATLAS_QUERY';
const MONROVIA_BRAND = 'Generic';

const backupRoot = join(
  process.cwd(),
  'backups',
  `clear-production-sales-${new Date().toISOString().replace(/[:.]/g, '-')}`,
);

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

async function collectionExists(name: string): Promise<boolean> {
  const collections = await db()
    .listCollections({ name })
    .toArray();
  return collections.length > 0;
}

async function backupCollection(name: string, filter: Record<string, unknown>) {
  if (!(await collectionExists(name))) {
    return { count: 0, skipped: true };
  }

  const docs = await db()
    .collection(name)
    .find(filter)
    .toArray();

  await writeFile(
    join(backupRoot, `${name}.json`),
    JSON.stringify(docs, null, 2),
    'utf8',
  );

  return { count: docs.length, skipped: false };
}

async function deleteFromCollection(name: string, filter: Record<string, unknown>) {
  if (!(await collectionExists(name))) {
    return { deletedCount: 0, skipped: true };
  }

  const result = await db().collection(name).deleteMany(filter);
  return { deletedCount: result.deletedCount ?? 0, skipped: false };
}

async function normalizeMonroviaBrands(execute: boolean) {
  if (!(await collectionExists('branches')) || !(await collectionExists('products'))) {
    return null;
  }

  const monrovia = await db().collection('branches').findOne({
    $or: [
      { code: 'MON' },
      { name: { $regex: '^Monrovia$', $options: 'i' } },
    ],
  });

  if (!monrovia?._id) {
    return { branchFound: false, matchedCount: 0, modifiedCount: 0 };
  }

  const filter = {
    branchId: monrovia._id,
    brand: { $ne: MONROVIA_BRAND },
  };
  const matchedCount = await db()
    .collection('products')
    .countDocuments(filter);

  if (!execute || matchedCount === 0) {
    return { branchFound: true, matchedCount, modifiedCount: 0 };
  }

  const result = await db()
    .collection('products')
    .updateMany(filter, { $set: { brand: MONROVIA_BRAND } });

  return {
    branchFound: true,
    matchedCount,
    modifiedCount: result.modifiedCount ?? 0,
  };
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is required');
  }

  const execute = process.env[EXECUTE_FLAG] === 'YES';
  const normalizeBrands = process.env[MONROVIA_BRAND_FLAG] === 'YES';

  await mongoose.connect(resolveMongoUri(uri), {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
  });

  try {
    const dbName = db().databaseName;
    console.log(`Connected to database: ${dbName}`);
    console.log(execute ? 'Mode: EXECUTE' : 'Mode: DRY RUN');

    const plans: CollectionPlan[] = [
      {
        name: 'sales',
        filter: {},
        description: 'all POS sale records, including credit balances and embedded payments',
      },
      {
        name: 'stockmovements',
        filter: {
          movementType: { $in: ['sale', 'return'] },
        },
        description: 'sale/return stock movement history only; product and batch stock quantities stay unchanged',
      },
      {
        name: 'shifts',
        filter: {},
        description: 'all shift history so sales reports and cash expectations reset',
      },
      {
        name: 'cashentries',
        filter: {
          category: 'sales',
        },
        description: 'sales-category cash entries and external daily revenue pushes',
      },
      {
        name: 'reconciliations',
        filter: {},
        description: 'CAF/EMR/LAB reconciliation report history',
      },
      {
        name: 'counters',
        filter: {
          $or: [
            { _id: { $regex: '^RCP-' } },
            { _id: { $regex: '^receipt:' } },
          ],
        },
        description: 'receipt counters',
      },
      {
        name: 'marketersales',
        filter: {},
        description: 'marketer sales report history; marketer assignment quantities are not adjusted',
      },
    ];

    await mkdir(backupRoot, { recursive: true });

    for (const plan of plans) {
      const backup = await backupCollection(plan.name, plan.filter);
      if (backup.skipped) {
        console.log(`SKIP ${plan.name}: collection not found`);
        continue;
      }

      console.log(
        `${execute ? 'DELETE' : 'WOULD DELETE'} ${backup.count} from ${plan.name} (${plan.description})`,
      );

      if (execute && backup.count > 0) {
        const deletion = await deleteFromCollection(plan.name, plan.filter);
        console.log(`Deleted ${deletion.deletedCount} from ${plan.name}`);
      }
    }

    if (normalizeBrands) {
      const brandResult = await normalizeMonroviaBrands(execute);
      if (!brandResult) {
        console.log('Monrovia brand cleanup skipped: branches/products collection not found');
      } else if (!brandResult.branchFound) {
        console.log('Monrovia brand cleanup skipped: Monrovia branch was not found');
      } else {
        console.log(
          `${execute ? 'UPDATED' : 'WOULD UPDATE'} ${execute ? brandResult.modifiedCount : brandResult.matchedCount} Monrovia product brand(s) to "${MONROVIA_BRAND}"`,
        );
      }
    }

    console.log(`Backup written to: ${backupRoot}`);

    if (!execute) {
      console.log(`Set ${EXECUTE_FLAG}=YES to perform the deletion.`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
