import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebAuthnRecoveryCodeDocument =
  HydratedDocument<WebAuthnRecoveryCode>;

@Schema({ collection: 'webauthn_recovery_codes', timestamps: true })
export class WebAuthnRecoveryCode {
  @Prop({ type: String, required: true, index: true })
  userId!: string;

  /**
   * SHA-256 hash of the plaintext code (hex). Plaintext is shown to the user
   * exactly once at generation and never persisted.
   */
  @Prop({ type: String, required: true })
  codeHash!: string;

  @Prop({ type: String, required: true })
  label!: string;

  @Prop({ type: Date })
  usedAt?: Date;

  @Prop({ type: Boolean, default: false })
  used!: boolean;

  @Prop({ type: Date, default: Date.now, expires: 60 * 60 * 24 * 365 })
  createdAt?: Date;
}

export const WebAuthnRecoveryCodeSchema =
  SchemaFactory.createForClass(WebAuthnRecoveryCode);

WebAuthnRecoveryCodeSchema.index({ userId: 1, codeHash: 1 }, { unique: true });
