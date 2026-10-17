import { model } from 'mongoose';
import { UserSchema } from './user.schema';

describe('Public user serialization', () => {
  it('never exposes password hashes in API JSON while retaining authentication data internally', () => {
    const User = model('PublicUserTest', UserSchema);
    const user = new User({
      username: 'staff',
      passwordHash: 'private-hash',
      role: 'cashier',
    });
    expect(user.passwordHash).toBe('private-hash');
    expect(
      JSON.parse(JSON.stringify({ data: [user] })).data[0],
    ).not.toHaveProperty('passwordHash');
  });
});
