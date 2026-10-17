import { generateKeyPairSync, sign } from 'node:crypto';
import {
  verifyEcdsaSha256,
  parseAuthData,
  parseCoseEcPublicKey,
} from './webauthn.util.js';

describe('WebAuthn signature compatibility', () => {
  it('verifies DER signatures with the persisted uncompressed P-256 key', () => {
    const pair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = pair.publicKey.export({ format: 'jwk' });
    const key = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, 'base64url'),
      Buffer.from(jwk.y!, 'base64url'),
    ]);
    const data = Buffer.from('authenticator and client hash');
    const signature = sign('sha256', data, pair.privateKey);
    expect(verifyEcdsaSha256(data, signature, key)).toBe(true);
    expect(verifyEcdsaSha256(Buffer.from('tampered'), signature, key)).toBe(
      false,
    );
    expect(verifyEcdsaSha256(data, signature, Buffer.alloc(65))).toBe(false);
  });
  it('rejects truncated attested credential data', () => {
    const data = Buffer.alloc(38);
    data[32] = 0x40;
    expect(() => parseAuthData(data)).toThrow();
  });
  it('rejects an unsupported COSE algorithm', () => {
    expect(() => parseCoseEcPublicKey(Buffer.from([0xa1, 1, 2]))).toThrow(
      'ES256',
    );
  });
});
