import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Customer extends Document {
  @Prop({ required: true })
  firstName!: string;

  @Prop({ required: true })
  lastName!: string;

  @Prop({ unique: true, sparse: true })
  phone?: string;

  @Prop({ unique: true, sparse: true })
  email?: string;

  @Prop()
  address?: string;

  @Prop()
  dateOfBirth?: Date;

  @Prop({ default: false })
  isInsured!: boolean;

  @Prop()
  insuranceProvider?: string;

  @Prop()
  insurancePolicyNumber?: string;

  @Prop({ default: 0 })
  loyaltyPoints!: number;

  @Prop({ default: true })
  isActive!: boolean;

  @Prop()
  notes?: string;
}

export const CustomerSchema = SchemaFactory.createForClass(Customer);

// Indexes
CustomerSchema.index({ phone: 1 });
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ firstName: 1, lastName: 1 });
