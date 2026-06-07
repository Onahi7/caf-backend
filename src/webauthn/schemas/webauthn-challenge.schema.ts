import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebAuthnChallengeDocument = WebAuthnChallenge & Document;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'webauthn_challenges' })
export class WebAuthnChallenge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  // "registration", "authentication", or "step-up"
  @Prop({ required: true, enum: ['registration', 'authentication', 'step-up'] })
  purpose!: 'registration' | 'authentication' | 'step-up';

  // Base64URL-encoded random challenge (32 bytes)
  @Prop({ required: true })
  challenge!: string;

  // Pending credential ID for registration (so we can tie challenge to a specific cred)
  @Prop()
  pendingCredentialId?: string;

  // Auto-expire after 5 minutes
  // expiresAt is enforced via TTL index from @Prop({ expires: 0 })
  @Prop({ required: true, expires: 0 })
  expiresAt!: Date;
}

export const WebAuthnChallengeSchema = SchemaFactory.createForClass(WebAuthnChallenge);
