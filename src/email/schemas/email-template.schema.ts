import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type EmailTemplateDocument = EmailTemplate & Document;

@Schema({ timestamps: true, collection: 'email_templates' })
export class EmailTemplate {
  @Prop({ required: true })
  name!: string;

  @Prop({ required: true })
  subject!: string;

  @Prop({ required: true })
  body!: string;

  @Prop({ required: true, default: 'general' })
  type!: string;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const EmailTemplateSchema = SchemaFactory.createForClass(EmailTemplate);
