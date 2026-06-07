import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum CounterType {
  RECEIPT = 'receipt',
}

@Schema({ _id: true, timestamps: false })
export class Counter {
  @Prop({ type: String, required: true, unique: true })
  _id!: string; // e.g., "RCP-20260501"

  @Prop({ type: Number, required: true, default: 0 })
  sequence!: number;
}

export type CounterDocument = HydratedDocument<Counter>;
export const CounterSchema = SchemaFactory.createForClass(Counter);
