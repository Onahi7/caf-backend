import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';

/** Extract a BSON ID from either an unpopulated reference or a populated document. */
export function referenceId(reference: unknown): string {
  const value =
    reference && typeof reference === 'object' && '_id' in reference
      ? (reference as { _id: unknown })._id
      : reference;
  const id = value instanceof Types.ObjectId ? value.toHexString() : value;
  if (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id)) {
    throw new BadRequestException('Invalid document reference');
  }
  return id.toLowerCase();
}
