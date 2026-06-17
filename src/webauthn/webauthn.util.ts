import { createHash, randomBytes, createPublicKey, verify, createHmac } from 'crypto';

/**
 * WebAuthn (FIDO2) crypto helpers - implements the spec without external libraries.
 * References: https://www.w3.org/TR/webauthn-2/ and https://datatracker.ietf.org/doc/html/rfc9052
 */

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url');
}

export function base64UrlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url');
}

export function base64Encode(buf: Buffer): string {
  return buf.toString('base64');
}

export function base64Decode(s: string): Buffer {
  return Buffer.from(s, 'base64');
}

/** Generate a 32-byte cryptographically random challenge (base64url-encoded). */
export function generateChallenge(): string {
  return base64UrlEncode(randomBytes(32));
}

/** SHA-256 of a buffer. */
export function sha256(buf: Buffer | string): Buffer {
  return createHash('sha256').update(buf).digest();
}

/** HMAC-SHA256 of a buffer (used for token hash storage). */
export function hmacSha256(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * Parse a COSE-encoded EC2 public key (ES256) into a Node.js KeyObject.
 * COSE EC2 key structure:
 *   { 1 (kty): 2 (EC2),
 *     3 (alg): -7 (ES256),
 *     -1 (crv): 1 (P-256),
 *     -2 (x):   bytes,
 *     -3 (y):   bytes }
 *
 * Encoded as a CBOR map. We use a minimal CBOR decoder for this specific structure.
 */
export function parseCoseEcPublicKey(coseBuf: Buffer): Buffer {
  // Minimal CBOR map decoder: works for the small set of keys we expect
  const map = decodeCborMap(coseBuf);
  if (map.get(1) !== 2) throw new Error('COSE key is not EC2');
  if (map.get(3) !== -7) throw new Error('COSE alg is not ES256');
  if (map.get(-1) !== 1) throw new Error('COSE curve is not P-256');
  const x = map.get(-2) as Buffer;
  const y = map.get(-3) as Buffer;
  if (!x || !y || x.length !== 32 || y.length !== 32) {
    throw new Error('COSE key x/y coordinates invalid');
  }
  // Build uncompressed P-256 public key: 0x04 || x || y
  return Buffer.concat([Buffer.from([0x04]), x, y]);
}

/**
 * Verify an ECDSA P-256 signature.
 * @param data The data that was signed
 * @param signature DER-encoded signature (from authenticatorData.attestedCredentialData or assertion.signature)
 * @param publicKey Uncompressed P-256 public key (65 bytes)
 */
export function verifyEcdsaSha256(
  data: Buffer,
  signature: Buffer,
  publicKey: Buffer,
): boolean {
  try {
    const keyObj = createPublicKey({
      key: Buffer.concat([
        // PEM header for raw EC public key
        Buffer.from(
          '-----BEGIN PUBLIC KEY-----\n',
        ),
        publicKey,
        Buffer.from('\n-----END PUBLIC KEY-----\n'),
      ]),
      format: 'pem',
      type: 'spki',
    });
    return verify('sha256', data, { key: keyObj, dsaEncoding: 'der' }, signature);
  } catch {
    return false;
  }
}

/**
 * Minimal CBOR decoder supporting the subset we need:
 *   - unsigned int (major type 0)
 *   - byte string (major type 2)
 *   - text string (major type 3) - converted to UTF-8 string
 *   - array (major type 4)
 *   - map (major type 5)
 *   - simple values (major type 7) including false, true, null
 *   - negative int (major type 1)
 *   - half-/single-precision float not needed
 */
function readCborValue(
  buf: Buffer,
  offset: number,
): { value: unknown; next: number } {
  const initial = buf[offset];
  if (initial === undefined) throw new Error('CBOR underflow');
  const majorType = initial >> 5;
  const additional = initial & 0x1f;
  let { value, next } = readCborArg(buf, offset + 1, additional, majorType);
  if (value instanceof CBORTag) {
    // Tagged values: not used in WebAuthn COSE keys
    throw new Error('CBOR tagged values not supported');
  }
  return { value, next };
}

function readCborArg(
  buf: Buffer,
  offset: number,
  additional: number,
  majorType: number,
): { value: unknown; next: number } {
  let length = additional;
  if (additional < 24) {
    // inline
  } else if (additional === 24) {
    length = buf.readUInt8(offset);
    offset += 1;
  } else if (additional === 25) {
    length = buf.readUInt16BE(offset);
    offset += 2;
  } else if (additional === 26) {
    length = buf.readUInt32BE(offset);
    offset += 4;
  } else if (additional === 27) {
    length = Number(buf.readBigUInt64BE(offset));
    offset += 8;
  } else if (additional === 31) {
    // indefinite length - not used in our subset
    throw new Error('CBOR indefinite length not supported');
  } else {
    throw new Error(`CBOR additional info ${additional} reserved`);
  }

  switch (majorType) {
    case 0: {
      return { value: length, next: offset };
    }
    case 1: {
      return { value: -1 - length, next: offset };
    }
    case 2: {
      const slice = buf.subarray(offset, offset + length);
      return { value: Buffer.from(slice), next: offset + length };
    }
    case 3: {
      const slice = buf.subarray(offset, offset + length);
      return { value: slice.toString('utf8'), next: offset + length };
    }
    case 4: {
      const arr: unknown[] = [];
      let pos = offset;
      for (let i = 0; i < length; i++) {
        const { value, next } = readCborValue(buf, pos);
        arr.push(value);
        pos = next;
      }
      return { value: arr, next: pos };
    }
    case 5: {
      const map = new Map<number | string, unknown>();
      let pos = offset;
      for (let i = 0; i < length; i++) {
        const { value: k, next: kEnd } = readCborValue(buf, pos);
        const { value: v, next: vEnd } = readCborValue(buf, kEnd);
        // COSE keys use integer labels
        if (typeof k === 'number') {
          map.set(k, v);
        } else {
          map.set(k as string, v);
        }
        pos = vEnd;
      }
      return { value: map, next: pos };
    }
    case 7: {
      if (length === 20) return { value: false, next: offset };
      if (length === 21) return { value: true, next: offset };
      if (length === 22) return { value: null, next: offset };
      if (length === 23) return { value: undefined, next: offset };
      throw new Error(`CBOR simple value ${length} not supported`);
    }
    default:
      throw new Error(`CBOR major type ${majorType} not supported`);
  }
}

class CBORTag {
  constructor(public tag: number, public value: unknown) {}
}

function decodeCborMap(buf: Buffer): Map<number | string, unknown> {
  const { value, next } = readCborValue(buf, 0);
  if (next !== buf.length) {
    // Some encoders include trailing data; tolerate it
  }
  if (!(value instanceof Map)) {
    throw new Error('COSE key is not a map');
  }
  return value as Map<number | string, unknown>;
}

/**
 * Decode an authData buffer into its components per WebAuthn spec.
 * Layout:
 *   rpIdHash (32 bytes) || flags (1 byte) || counter (4 bytes, big-endian) ||
 *   [attestedCredentialData] || [extensions]
 */
export interface ParsedAuthData {
  rpIdHash: Buffer;
  flags: number;
  counter: number;
  attestedCredentialData?: {
    aaguid: Buffer;
    credentialId: Buffer;
    publicKey: Buffer;
  };
}

export function parseAuthData(authData: Buffer): ParsedAuthData {
  if (authData.length < 37) {
    throw new Error('authData too short');
  }
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  const counter = authData.readUInt32BE(33);
  let pos = 37;
  let attestedCredentialData: ParsedAuthData['attestedCredentialData'];
  if (flags & 0x40) {
    // AT flag set
    const aaguid = authData.subarray(pos, pos + 16);
    pos += 16;
    const credIdLen = authData.readUInt16BE(pos);
    pos += 2;
    const credentialId = authData.subarray(pos, pos + credIdLen);
    pos += credIdLen;
    // The publicKey is a CBOR map; we need to find its end. Decode a map at `pos`
    // and read whatever its declared length is.
    const { next } = readCborValue(authData, pos);
    const publicKeyEnd = next;
    const publicKey = authData.subarray(pos, publicKeyEnd);
    pos = publicKeyEnd;
    attestedCredentialData = { aaguid, credentialId, publicKey };
  }
  return { rpIdHash, flags, counter, attestedCredentialData };
}

/**
 * Verify the clientDataJSON hash matches a given challenge and origin type.
 * @param clientDataJSON The raw bytes sent by the authenticator
 * @param expectedChallenge The challenge we issued (base64url)
 * @param expectedType "webauthn.create" or "webauthn.get"
 */
export function verifyClientData(
  clientDataJSON: Buffer,
  expectedChallenge: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
): { challenge: string; type: string; origin: string; crossOrigin: boolean } {
  const obj = JSON.parse(clientDataJSON.toString('utf8'));
  if (obj.type !== expectedType) {
    throw new Error(`Unexpected clientData type ${obj.type}`);
  }
  if (obj.challenge !== expectedChallenge) {
    throw new Error('Challenge mismatch');
  }
  // origin: web uses "origin" field; native uses "appid" (Android) - we accept both
  const origin = obj.origin ?? obj.appid ?? '';
  const crossOrigin = !!obj.crossOrigin;
  return { challenge: obj.challenge, type: obj.type, origin, crossOrigin };
}

/** Compute the RP ID hash (SHA-256 of rpId as ASCII). */
export function rpIdHash(rpId: string): Buffer {
  return sha256(Buffer.from(rpId, 'ascii'));
}
