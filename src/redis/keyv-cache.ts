import Keyv, { KeyvStoreAdapter } from 'keyv';

export function createSessionCache(store: KeyvStoreAdapter): Keyv {
  return new Keyv({ store, throwOnErrors: true });
}
