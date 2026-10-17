import { createSessionCache } from './keyv-cache.js';

describe('Session cache failure propagation', () => {
  it('does not report successful logout when the adapter cannot delete', async () => {
    const adapter = {
      get: jest.fn().mockResolvedValue(undefined),
      set: jest.fn(),
      delete: jest.fn().mockRejectedValue(new Error('DEL failed')),
      clear: jest.fn(),
    };
    const keyv = createSessionCache(adapter);
    // Exercise the actual installed Nest provider, including its Keyv wrapping.
    const {
      createCacheManager,
    } = require('@nestjs/cache-manager/dist/cache.providers');
    const cache = await createCacheManager().useFactory({ stores: [keyv] });
    await expect(cache.del('refresh_token:user')).rejects.toThrow('DEL failed');
  });
});
