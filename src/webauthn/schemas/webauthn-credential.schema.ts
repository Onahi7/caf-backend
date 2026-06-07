import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebAuthnCredentialDocument = WebAuthnCredential & Document;

@Schema({ timestamps: true, collection: 'webauthn_credentials' })
export class WebAuthnCredential {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  // Base64URL-encoded credential ID (max 1023 bytes per spec)
  @Prop({ required: true, unique: true, index: true })
  credentialId!: string;

  // Base64-encoded COSE-encoded public key
  @Prop({ required: true })
  publicKey!: string;

  // Signature counter for clone-detection (increment on each use)
  @Prop({ default: 0 })
  counter!: number;

  // transports: ['usb', 'nfc', 'ble', 'internal', 'hybrid']
  @Prop({ type: [String], default: [] })
  transports!: string[];

  // "platform" (built-in) or "cross-platform" (security key)
  @Prop({ required: true })
  authenticatorAttachment!: 'platform' | 'cross-platform';

  // User-friendly device name
  @Prop()
  deviceName?: string;

  // For backup-eligibility tracking
  @Prop({ default: false })
  backupEligible!: boolean;

  @Prop({ default: false })
  backupState!: boolean;

  // User verification level: "preferred" | "required" | "discouraged"
  @Prop({ default: 'preferred' })
  userVerification!: string;

  // Last time this credential was used
  @Prop()
  lastUsedAt?: Date;

  // Revoked (e.g. user removed the device)
  @Prop({ default: false, index: true })
  revoked!: boolean;
}

export const WebAuthnCredentialSchema = SchemaFactory.createForClass(WebAuthnCredential);
WebAuthnCredentialSchema.index({ userId: 1, revoked: 1 });
