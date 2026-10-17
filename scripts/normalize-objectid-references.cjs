/* Explicit, dry-run-first repair for references persisted as strings by old schemas. */
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
require('reflect-metadata');

function normalize(document, schema) {
  const changed = {};
  schema.eachPath((key, type) => {
    if (key.includes('.') || key === '_id') return;
    const value = document[key];
    if (value == null) return;
    if (
      type.instance === 'ObjectId' &&
      typeof value === 'string' &&
      /^[a-f\d]{24}$/i.test(value)
    ) {
      changed[key] = new mongoose.Types.ObjectId(value);
    } else if (type.schema) {
      const values = Array.isArray(value) ? value : [value];
      let modified = false;
      const result = values.map((item) => {
        const updates = normalize(item, type.schema);
        modified ||= Object.keys(updates).length > 0;
        return { ...item, ...updates };
      });
      if (modified) changed[key] = Array.isArray(value) ? result : result[0];
    } else if (
      type.instance === 'Array' &&
      (type.embeddedSchemaType || type.caster)?.instance === 'ObjectId'
    ) {
      if (
        value.some(
          (item) => typeof item === 'string' && /^[a-f\d]{24}$/i.test(item),
        )
      ) {
        changed[key] = value.map((item) =>
          typeof item === 'string' && /^[a-f\d]{24}$/i.test(item)
            ? new mongoose.Types.ObjectId(item)
            : item,
        );
      }
    }
  });
  return changed;
}

async function main() {
  // No .env loading: the intended database must be supplied explicitly.
  const uri = process.env.REFERENCE_MIGRATION_URI;
  if (!uri)
    throw new Error(
      'Set REFERENCE_MIGRATION_URI explicitly. Default mode is a dry run; --apply writes conversions.',
    );
  const apply = process.argv.includes('--apply');
  await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
  try {
    const collections = new Set(
      (
        await mongoose.connection.db
          .listCollections({}, { nameOnly: true })
          .toArray()
      ).map((item) => item.name),
    );
    const schemas = new Map();
    function discover(directory) {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) discover(file);
        else if (entry.name.endsWith('.schema.js')) {
          for (const [name, schema] of Object.entries(require(file))) {
            if (name.endsWith('Schema') && schema instanceof mongoose.Schema) {
              const modelName = name.slice(0, -6);
              const collection =
                schema.options.collection || mongoose.pluralize()(modelName);
              if (collections.has(collection)) schemas.set(collection, schema);
            }
          }
        }
      }
    }
    discover(path.resolve(__dirname, '../dist'));
    let changed = 0,
      conflicts = 0;
    for (const [name, schema] of schemas) {
      let affected = 0;
      const collection = mongoose.connection.collection(name);
      for await (const document of collection.find({})) {
        const updates = normalize(document, schema);
        if (!Object.keys(updates).length) continue;
        affected++;
        if (apply) {
          // Compare every changed field so concurrent writes are never overwritten.
          const filter = {
            _id: document._id,
            ...Object.fromEntries(
              Object.keys(updates).map((key) => [key, document[key]]),
            ),
          };
          const result = await collection.updateOne(filter, { $set: updates });
          if (!result.matchedCount) conflicts++;
        }
      }
      if (affected)
        console.log(
          `${name}: ${affected} documents ${apply ? 'processed' : 'would change'}`,
        );
      changed += affected;
    }
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        database: mongoose.connection.name,
        affected: changed,
        conflicts,
      }),
    );
    if (conflicts) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { normalize };
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
