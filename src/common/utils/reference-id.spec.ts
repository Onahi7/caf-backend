import { Schema, Types } from 'mongoose';
import { referenceId } from './reference-id.js';

describe('Stored reference compatibility', () => {
  const id = new Types.ObjectId();
  it('normalizes populated and unpopulated references', () => {
    for (const value of [
      id,
      id.toHexString(),
      { _id: id },
      { _id: id.toHexString() },
    ])
      expect(referenceId(value)).toBe(id.toHexString());
    expect(() => referenceId(undefined)).toThrow('Invalid document reference');
  });
  it('migrates only schema-declared BSON references, including nested arrays', () => {
    const {
      normalize,
    } = require('../../../scripts/normalize-objectid-references.cjs');
    const schema = new Schema({
      branchId: Schema.Types.ObjectId,
      label: String,
      refs: [Schema.Types.ObjectId],
      items: [{ productId: Schema.Types.ObjectId, name: String }],
    });
    const document = {
      branchId: id.toHexString(),
      label: id.toHexString(),
      refs: [id.toHexString()],
      items: [{ productId: id.toHexString(), name: id.toHexString() }],
    };
    const updates = normalize(document, schema);
    expect(updates.branchId).toEqual(id);
    expect(updates.refs).toEqual([id]);
    expect(updates.items[0]).toEqual({ productId: id, name: id.toHexString() });
    expect(updates.label).toBeUndefined();
    expect(normalize({ ...document, ...updates }, schema)).toEqual({});
  });
});
