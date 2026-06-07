import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import {
  WebAuthnCredential,
  WebAuthnCredentialDocument,
} from './schemas/webauthn-credential.schema.js';
import {
  WebAuthnChallenge,
  WebAuthnChallengeDocument,
} from './schemas/webauthn-challenge.schema.js';
import {
  WebAuthnRecoveryCode,
  WebAuthnRecoveryCodeDocument,
} from './schemas/webauthn-recovery-code.schema.js';
import { UsersService } from '../users/users.service.js';
import { TokenResponseDto } from '../auth/dto/token-response.dto.js';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuditResource } from '../audit/schemas/audit-log.schema.js';
import { AuditAction } from '../audit/schemas/audit-log.schema.js';
import {
  generateRecoveryCode,
  hashRecoveryCode,
  normaliseRecoveryCode,
} from './webauthn-recovery.util.js';
import { StepUpTokenService } from '../auth/services/step-up-token.service.js';
import {
  base64UrlDecode,
  base64UrlEncode,
  base64Encode,
  generateChallenge,
  parseAuthData,
  parseCoseEcPublicKey,
  rpIdHash,
  sha256,
  verifyClientData,
  verifyEcdsaSha256,
} from './webauthn.util.js';

export interface PublicKeyCredentialCreationOptionsJSON {
  rp: { id: string; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: { type: 'public-key'; alg: number }[];
  timeout: number;
  attestation: 'none' | 'direct' | 'indirect';
  authenticatorSelection: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    residentKey?: 'discouraged' | 'preferred' | 'required';
    userVerification?: 'discouraged' | 'preferred' | 'required';
  };
  excludeCredentials: { id: string; type: 'public-key'; transports?: string[] }[];
  hints?: string[];
}

export interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  timeout: number;
  rpId: string;
  allowCredentials: { id: string; type: 'public-key'; transports?: string[] }[];
  userVerification: 'discouraged' | 'preferred' | 'required';
}

@Injectable()
export class WebAuthnService {
  private readonly rpId: string;
  private readonly rpName: string;

  constructor(
    @InjectModel(WebAuthnCredential.name)
    private readonly credentialModel: Model<WebAuthnCredentialDocument>,
    @InjectModel(WebAuthnChallenge.name)
    private readonly challengeModel: Model<WebAuthnChallengeDocument>,
    @InjectModel(WebAuthnRecoveryCode.name)
    private readonly recoveryCodeModel: Model<WebAuthnRecoveryCodeDocument>,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly config: ConfigService,
    private readonly stepUpTokens: StepUpTokenService,
  ) {
    this.rpId = this.config.get<string>('WEBAUTHN_RP_ID', 'localhost');
    this.rpName = this.config.get<string>('WEBAUTHN_RP_NAME', 'CareFAM POS');
  }

  /**
   * Start registration: returns the publicKeyCredentialCreationOptions that the
   * browser/SDK turns into a credential via navigator.credentials.create().
   */
  async startRegistration(
    userId: string,
    options: { deviceName?: string } = {},
  ): Promise<PublicKeyCredentialCreationOptionsJSON> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const existing = await this.credentialModel
      .find({ userId: new Types.ObjectId(userId), revoked: false })
      .lean()
      .exec();

    const challenge = generateChallenge();
    // Persist challenge for verification step
    await this.challengeModel.create({
      userId: new Types.ObjectId(userId),
      purpose: 'registration',
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });

    return {
      rp: { id: this.rpId, name: this.rpName },
      user: {
        id: base64UrlEncode(Buffer.from(user._id.toString())),
        name: user.username,
        displayName: `${user.firstName} ${user.lastName}`.trim() || user.username,
      },
      challenge,
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 }, // RS256
      ],
      timeout: 60_000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'preferred',
        residentKey: 'preferred',
      },
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        type: 'public-key',
        transports: c.transports,
      })),
      hints: options.deviceName ? undefined : ['client-device'],
    };
  }

  /**
   * Finish registration: verify the attestation response, persist the credential.
   * Input matches the JSON serialization from `navigator.credentials.create()`.
   */
  async finishRegistration(
    userId: string,
    response: {
      id: string;
      rawId: string;
      type: 'public-key';
      response: {
        clientDataJSON: string; // base64url
        attestationObject: string; // base64url
        transports?: string[];
      };
      authenticatorAttachment?: 'platform' | 'cross-platform';
      clientExtensionResults?: Record<string, unknown>;
    },
    options: { deviceName?: string } = {},
  ): Promise<{ credentialId: string; deviceName?: string }> {
    const challengeDoc = await this.challengeModel
      .findOneAndDelete({
        userId: new Types.ObjectId(userId),
        purpose: 'registration',
      })
      .sort({ createdAt: -1 })
      .exec();
    if (!challengeDoc) {
      throw new BadRequestException('No pending registration challenge');
    }

    const clientDataJSON = base64UrlDecode(response.response.clientDataJSON);
    const { challenge, type } = verifyClientData(
      clientDataJSON,
      challengeDoc.challenge,
      'webauthn.create',
    );
    if (challenge !== challengeDoc.challenge) {
      throw new UnauthorizedException('Challenge mismatch');
    }
    if (type !== 'webauthn.create') {
      throw new BadRequestException('Unexpected ceremony type');
    }

    const attestation = base64UrlDecode(response.response.attestationObject);
    // We only support "none" attestation format (which is the recommended default)
    const fmt = attestation.toString('utf8', 0, 4);
    if (fmt !== 'none') {
      // For "none" format, the attestation statement is an empty CBOR map
      // We've consumed the first 4 bytes (the fmt string); the authData follows.
      // Other formats we don't support — would require CBOR attestation parsing.
      // Bail safely:
      if (fmt === 'packed' || fmt === 'fido-u2f' || fmt === 'tpm' || fmt === 'android-key' || fmt === 'apple') {
        // For simplicity we accept any format but only extract authData
      } else {
        throw new BadRequestException(`Unsupported attestation format: ${fmt}`);
      }
    }

    // Skip the attestation statement: for "none" it's a 0-length CBOR map,
    // for other formats it's a CBOR map of varying length. We need to find
    // the end of the authData. Parse from the end backwards — authData is
    // the last element, but its length isn't known without decoding.
    // The simplest path: decode the whole attestation as CBOR.
    const att = decodeAttestationObject(attestation);
    const authData = att.authData;
    const parsed = parseAuthData(authData);

    // rpIdHash must match
    const expectedRpIdHash = rpIdHash(this.rpId);
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      throw new UnauthorizedException('RP ID hash mismatch');
    }

    if (!parsed.attestedCredentialData) {
      throw new BadRequestException('Missing attested credential data');
    }

    const credentialIdB64Url = base64UrlEncode(parsed.attestedCredentialData.credentialId);
    // Sanity: must match the credentialId in the response
    if (credentialIdB64Url !== response.id && credentialIdB64Url !== response.rawId) {
      throw new BadRequestException('Credential ID mismatch');
    }

    // Extract raw public key
    const publicKeyUncompressed = parseCoseEcPublicKey(parsed.attestedCredentialData.publicKey);
    const publicKeyB64 = base64Encode(publicKeyUncompressed);

    // User Presence (UP=0x01) flag must be set
    if (!(parsed.flags & 0x01)) {
      throw new BadRequestException('User presence flag not set');
    }

    // Persist
    const created = await this.credentialModel.create({
      userId: new Types.ObjectId(userId),
      credentialId: credentialIdB64Url,
      publicKey: publicKeyB64,
      counter: parsed.counter,
      transports: response.response.transports ?? [],
      authenticatorAttachment:
        response.authenticatorAttachment ?? (options.deviceName ? 'cross-platform' : 'platform'),
      deviceName: options.deviceName ?? this.defaultDeviceName(parsed.flags),
      backupEligible: !!(parsed.flags & 0x08),
      backupState: !!(parsed.flags & 0x10),
      userVerification: 'preferred',
    });

    const user = await this.usersService.findById(userId);
    try {
      await this.auditService.logCreate(
        userId,
        user?.username ?? 'unknown',
        AuditResource.WEBAUTHN_CREDENTIAL,
        created._id.toString(),
        { credentialId: created.credentialId, deviceName: created.deviceName },
      );
    } catch {
      // non-fatal
    }

    return { credentialId: created.credentialId, deviceName: created.deviceName };
  }

  /**
   * Start login: returns publicKeyCredentialRequestOptions for navigator.credentials.get().
   * For passwordless login the user is identified by their username.
   * If username is omitted, this is a resident-key / usernameless flow.
   */
  async startLogin(
    username?: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const challenge = generateChallenge();
    const userId = username
      ? (await this.usersService.findByUsername(username))?._id.toString()
      : undefined;

    if (username && !userId) {
      // Don't leak whether the user exists
      throw new UnauthorizedException('Invalid credentials');
    }

    const filter: Record<string, unknown> = { revoked: false };
    if (userId) filter.userId = new Types.ObjectId(userId);

    const credentials = await this.credentialModel.find(filter).lean().exec();
    if (credentials.length === 0) {
      // Don't leak that there are no credentials; let the ceremony fail on the client
    }

    await this.challengeModel.create({
      userId: userId ? new Types.ObjectId(userId) : new Types.ObjectId(), // dummy for un-attributable
      purpose: 'authentication',
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });

    return {
      challenge,
      timeout: 60_000,
      rpId: this.rpId,
      userVerification: 'preferred',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        type: 'public-key',
        transports: c.transports,
      })),
    };
  }

  /**
   * Start a step-up challenge for the *currently authenticated* user. The
   * challenge is tied to this userId so the verification in finishStepUp
   * can confirm the same user is the one responding.
   */
  async startStepUp(
    userId: string,
  ): Promise<PublicKeyCredentialRequestOptionsJSON> {
    const credentials = await this.credentialModel
      .find({ userId: new Types.ObjectId(userId), revoked: false })
      .lean()
      .exec();
    if (credentials.length === 0) {
      throw new BadRequestException(
        'No registered passkeys. Register a passkey under Account Security first.',
      );
    }
    const challenge = generateChallenge();
    await this.challengeModel.create({
      userId: new Types.ObjectId(userId),
      purpose: 'step-up',
      challenge,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    });
    return {
      challenge,
      timeout: 60_000,
      rpId: this.rpId,
      userVerification: 'required',
      allowCredentials: credentials.map((c) => ({
        id: c.credentialId,
        type: 'public-key',
        transports: c.transports,
      })),
    };
  }

  /**
   * Finish step-up: verify assertion and issue a short-lived step-up token.
   * Does NOT issue new access/refresh tokens — the existing session is preserved.
   */
  async finishStepUp(
    userId: string,
    response: {
      id: string;
      rawId: string;
      type: 'public-key';
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
      };
    },
    reason: string,
  ): Promise<{ token: string; expiresAt: number }> {
    const challengeDoc = await this.challengeModel
      .findOneAndDelete({ userId: new Types.ObjectId(userId), purpose: 'step-up' })
      .sort({ createdAt: -1 })
      .exec();
    if (!challengeDoc) {
      throw new BadRequestException('No pending step-up challenge');
    }

    const credential = await this.credentialModel.findOne({
      credentialId: response.id,
      userId: new Types.ObjectId(userId),
      revoked: false,
    });
    if (!credential) {
      throw new UnauthorizedException('Unknown credential for this user');
    }

    const clientDataJSON = base64UrlDecode(response.response.clientDataJSON);
    const { challenge } = verifyClientData(
      clientDataJSON,
      challengeDoc.challenge,
      'webauthn.get',
    );
    if (challenge !== challengeDoc.challenge) {
      throw new UnauthorizedException('Challenge mismatch');
    }

    const authData = base64UrlDecode(response.response.authenticatorData);
    const parsed = parseAuthData(authData);
    const expectedRpIdHash = rpIdHash(this.rpId);
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      throw new UnauthorizedException('RP ID hash mismatch');
    }
    if (!(parsed.flags & 0x01)) {
      throw new BadRequestException('User presence flag not set');
    }
    if (!(parsed.flags & 0x04)) {
      throw new BadRequestException('User verification flag not set (UV required for step-up)');
    }

    const signature = base64UrlDecode(response.response.signature);
    const clientDataHash = sha256(clientDataJSON);
    const data = Buffer.concat([authData, clientDataHash]);
    const publicKey = Buffer.from(credential.publicKey, 'base64');
    const valid = verifyEcdsaSha256(data, signature, publicKey);
    if (!valid) {
      throw new UnauthorizedException('Invalid signature');
    }

    if (parsed.counter > 0 && parsed.counter <= credential.counter) {
      throw new UnauthorizedException(
        'Authenticator counter did not increment (possible clone)',
      );
    }

    credential.counter = parsed.counter;
    credential.lastUsedAt = new Date();
    await credential.save();

    const user = await this.usersService.findById(userId);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Issue the step-up token (5 min, single-use)
    const { token, expiresAt } = this.stepUpTokens.issue(userId);
    await this.auditService.log({
      userId,
      username: user.username,
      action: AuditAction.LOGIN,
      resource: AuditResource.WEBAUTHN_CREDENTIAL,
      resourceId: userId,
      description: `Step-up auth issued: ${reason}`,
      metadata: { reason, expiresAt: new Date(expiresAt).toISOString() },
    });
    return { token, expiresAt };
  }

  /**
   * Finish login: verify assertion, issue JWT tokens.
   */
  async finishLogin(
    response: {
      id: string;
      rawId: string;
      type: 'public-key';
      response: {
        clientDataJSON: string;
        authenticatorData: string;
        signature: string;
        userHandle?: string;
      };
    },
  ): Promise<TokenResponseDto> {
    // Find the most recent authentication challenge (across all users if username unknown)
    const challengeDoc = await this.challengeModel
      .findOneAndDelete({ purpose: 'authentication' })
      .sort({ createdAt: -1 })
      .exec();
    if (!challengeDoc) {
      throw new BadRequestException('No pending login challenge');
    }

    const credentialIdB64Url = response.id;
    const credential = await this.credentialModel.findOne({
      credentialId: credentialIdB64Url,
      revoked: false,
    });
    if (!credential) {
      throw new UnauthorizedException('Unknown credential');
    }

    const clientDataJSON = base64UrlDecode(response.response.clientDataJSON);
    const { challenge } = verifyClientData(
      clientDataJSON,
      challengeDoc.challenge,
      'webauthn.get',
    );
    if (challenge !== challengeDoc.challenge) {
      throw new UnauthorizedException('Challenge mismatch');
    }

    const authData = base64UrlDecode(response.response.authenticatorData);
    const parsed = parseAuthData(authData);

    const expectedRpIdHash = rpIdHash(this.rpId);
    if (!parsed.rpIdHash.equals(expectedRpIdHash)) {
      throw new UnauthorizedException('RP ID hash mismatch');
    }
    if (!(parsed.flags & 0x01)) {
      throw new BadRequestException('User presence flag not set');
    }

    // Verify the signature: signed data = authenticatorData || SHA-256(clientDataJSON)
    const signature = base64UrlDecode(response.response.signature);
    const clientDataHash = sha256(clientDataJSON);
    const data = Buffer.concat([authData, clientDataHash]);
    const publicKey = Buffer.from(credential.publicKey, 'base64');
    const valid = verifyEcdsaSha256(data, signature, publicKey);
    if (!valid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Counter check (clone detection)
    if (parsed.counter > 0 && parsed.counter <= credential.counter) {
      // Counter didn't increment — possible cloned authenticator
      throw new UnauthorizedException(
        'Authenticator counter did not increment (possible clone)',
      );
    }

    // Update counter + lastUsed
    credential.counter = parsed.counter;
    credential.lastUsedAt = new Date();
    await credential.save();

    // If challenge was tied to a specific user, ensure they match
    if (challengeDoc.userId && !challengeDoc.userId.equals(credential.userId)) {
      throw new UnauthorizedException('Credential does not match user');
    }

    const user = await this.usersService.findById(credential.userId.toString());
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Issue tokens (same path as password login)
    const tokens = await this.authService.issueTokensForUser(user);

    try {
      await this.auditService.logLogin(user._id.toString(), user.username);
    } catch {
      // non-fatal
    }

    return tokens;
  }

  /** List credentials for the current user (e.g. for "trusted devices" UI). */
  async listCredentials(userId: string): Promise<WebAuthnCredentialDocument[]> {
    return this.credentialModel
      .find({ userId: new Types.ObjectId(userId), revoked: false })
      .sort({ lastUsedAt: -1, createdAt: -1 })
      .exec();
  }

  async revokeCredential(userId: string, credentialId: string): Promise<void> {
    const res = await this.credentialModel
      .updateOne(
        { _id: new Types.ObjectId(credentialId), userId: new Types.ObjectId(userId) },
        { $set: { revoked: true } },
      )
      .exec();
    if (res.matchedCount === 0) {
      throw new NotFoundException('Credential not found');
    }
    const user = await this.usersService.findById(userId);
    try {
      await this.auditService.logDelete(
        userId,
        user?.username ?? 'unknown',
        AuditResource.WEBAUTHN_CREDENTIAL,
        credentialId,
        { credentialId },
      );
    } catch {
      // non-fatal
    }
  }

  /**
   * Generate a fresh batch of 10 single-use recovery codes. Invalidates
   * any unused codes from previous generations. Returns the plaintext
   * codes for one-time display to the user; only their hashes are stored.
   */
  async generateRecoveryCodes(userId: string): Promise<{ codes: string[] }> {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    await this.recoveryCodeModel.deleteMany({ userId, used: false }).exec();
    const codes: string[] = [];
    const docs: Partial<WebAuthnRecoveryCode>[] = [];
    for (let i = 0; i < 10; i++) {
      const plaintext = generateRecoveryCode();
      codes.push(plaintext);
      docs.push({
        userId,
        codeHash: hashRecoveryCode(plaintext),
        label: `Recovery code ${i + 1}`,
      });
    }
    await this.recoveryCodeModel.insertMany(docs);
    try {
      await this.auditService.log({
        userId,
        username: user.username,
        action: AuditAction.CREATE,
        resource: AuditResource.WEBAUTHN_CREDENTIAL,
        resourceId: userId,
        description: 'Generated 10 recovery codes',
        metadata: { count: 10 },
      });
    } catch {
      // non-fatal
    }
    return { codes };
  }

  /** How many recovery codes remain unused (for the UI banner). */
  async countRecoveryCodes(userId: string): Promise<{ unused: number }> {
    const unused = await this.recoveryCodeModel
      .countDocuments({ userId, used: false })
      .exec();
    return { unused };
  }

  /**
   * Consume a recovery code as a one-shot login: finds the matching unused
   * code, marks it used, and issues tokens. If biometric is lost this is
   * the only way back in.
   */
  async loginWithRecoveryCode(
    username: string,
    plaintextCode: string,
  ): Promise<TokenResponseDto> {
    const user = await this.usersService.findByUsername(username);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const normalised = normaliseRecoveryCode(plaintextCode);
    const codeHash = hashRecoveryCode(normalised);
    const code = await this.recoveryCodeModel.findOne({
      userId: user._id.toString(),
      codeHash,
      used: false,
    });
    if (!code) {
      try {
        await this.auditService.log({
          userId: user._id.toString(),
          username: user.username,
          action: AuditAction.LOGIN,
          resource: AuditResource.WEBAUTHN_CREDENTIAL,
          resourceId: user._id.toString(),
          description: 'Failed recovery-code login (invalid code)',
          metadata: { reason: 'invalid' },
        });
      } catch {
        // non-fatal
      }
      throw new UnauthorizedException('Invalid recovery code');
    }
    code.used = true;
    code.usedAt = new Date();
    await code.save();

    const tokens = await this.authService.issueTokensForUser(user);
    try {
      await this.auditService.logLogin(user._id.toString(), user.username);
    } catch {
      // non-fatal
    }
    return tokens;
  }

  /**
   * Admin-only: revoke ALL credentials and ALL unused recovery codes for a
   * user. Used when the user has lost all devices and needs to re-enroll.
   */
  async adminResetUserCredentials(
    adminUserId: string,
    targetUserId: string,
  ): Promise<{ revokedCredentials: number; revokedCodes: number }> {
    const credRes = await this.credentialModel
      .updateMany(
        { userId: new Types.ObjectId(targetUserId), revoked: false },
        { $set: { revoked: true } },
      )
      .exec();
    const codeRes = await this.recoveryCodeModel
      .deleteMany({ userId: targetUserId, used: false })
      .exec();
    const target = await this.usersService.findById(targetUserId);
    try {
      await this.auditService.log({
        userId: adminUserId,
        username: 'admin',
        action: AuditAction.DELETE,
        resource: AuditResource.WEBAUTHN_CREDENTIAL,
        resourceId: targetUserId,
        description: `Admin reset WebAuthn for ${target?.username ?? targetUserId}`,
        metadata: {
          revokedCredentials: credRes.modifiedCount,
          revokedCodes: codeRes.deletedCount,
        },
      });
    } catch {
      // non-fatal
    }
    return {
      revokedCredentials: credRes.modifiedCount ?? 0,
      revokedCodes: codeRes.deletedCount ?? 0,
    };
  }

  private defaultDeviceName(flags: number): string {
    const date = new Date().toISOString().slice(0, 10);
    return `Device registered ${date}${flags & 0x04 ? ' · UV' : ''}`;
  }
}

/**
 * Minimal CBOR decode of an attestation object.
 * Layout: { fmt: text, attStmt: any, authData: bytes }
 * We only need to extract authData reliably.
 */
function decodeAttestationObject(buf: Buffer): { fmt: string; authData: Buffer } {
  // The attestation object is a CBOR map with 3+ keys: fmt (3), attStmt (?), authData (...)
  const { value } = readCborValueAny(buf, 0);
  if (!(value instanceof Map)) {
    throw new Error('Attestation object is not a CBOR map');
  }
  const fmt = value.get(3) as string | undefined;
  // Find the bytes value of length 37+ (authData is always ≥ 37 bytes)
  let foundAuthData: Buffer | undefined;
  for (const v of value.values()) {
    if (Buffer.isBuffer(v) && v.length >= 37) {
      foundAuthData = v;
      break;
    }
  }
  if (!foundAuthData) {
    throw new Error('authData not found in attestation object');
  }
  return { fmt: fmt ?? 'unknown', authData: foundAuthData };
}

// Re-declare the readCborValue from webauthn.util — but we can't import the private fn.
// Instead, use a simplified decoder for the attestation object.
function readCborValueAny(
  buf: Buffer,
  offset: number,
): { value: unknown; next: number } {
  const initial = buf[offset];
  if (initial === undefined) throw new Error('CBOR underflow');
  const majorType = initial >> 5;
  const additional = initial & 0x1f;
  return readCborArgAny(buf, offset + 1, additional, majorType);
}

function readCborArgAny(
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
  } else {
    throw new Error(`CBOR additional info ${additional} not supported`);
  }

  switch (majorType) {
    case 0:
      return { value: length, next: offset };
    case 1:
      return { value: -1 - length, next: offset };
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
        const { value, next } = readCborValueAny(buf, pos);
        arr.push(value);
        pos = next;
      }
      return { value: arr, next: pos };
    }
    case 5: {
      const map = new Map<number | string, unknown>();
      let pos = offset;
      for (let i = 0; i < length; i++) {
        const { value: k, next: kEnd } = readCborValueAny(buf, pos);
        const { value: v, next: vEnd } = readCborValueAny(buf, kEnd);
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
