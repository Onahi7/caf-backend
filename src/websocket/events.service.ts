import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Events Service for emitting domain events
 * Services emit events, and the WebSocket gateway listens to them
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit inventory update event
   */
  emitInventoryUpdate(data: InventoryUpdateEvent) {
    this.logger.debug(`Emitting inventory update event: ${data.batchId}`);
    this.eventEmitter.emit('inventory.updated', data);
  }

  /**
   * Emit batch update event
   */
  emitBatchUpdate(data: BatchUpdateEvent) {
    this.logger.debug(`Emitting batch update event: ${data.batchId}`);
    this.eventEmitter.emit('batch.updated', data);
  }

  /**
   * Emit sale update event
   */
  emitSaleUpdate(data: SaleUpdateEvent) {
    this.logger.debug(`Emitting sale update event: ${data.saleId}`);
    this.eventEmitter.emit('sale.updated', data);
  }

  /**
   * Emit transfer update event
   */
  emitTransferUpdate(data: TransferUpdateEvent) {
    this.logger.debug(`Emitting transfer update event: ${data.transferId}`);
    this.eventEmitter.emit('transfer.updated', data);
  }
}

/**
 * Event data interfaces
 */
export interface InventoryUpdateEvent {
  batchId: string;
  productId: string;
  branchId: string;
  quantityAvailable: number;
  updateType: 'sale' | 'purchase' | 'transfer' | 'adjustment' | 'return';
  timestamp: Date;
}

export interface BatchUpdateEvent {
  batchId: string;
  productId: string;
  branchId: string;
  quantityAvailable: number;
  isExpired?: boolean;
  isDepleted?: boolean;
  updateType: 'created' | 'updated' | 'depleted' | 'expired';
  timestamp: Date;
}

export interface SaleUpdateEvent {
  saleId: string;
  branchId: string;
  shiftId: string;
  total: number;
  paymentMethod: string;
  paymentReference?: string;
  items: Array<{
    productId: string;
    batchId: string;
    quantity: number;
  }>;
  updateType: 'completed' | 'returned' | 'partially_returned';
  timestamp: Date;
}

export interface TransferUpdateEvent {
  transferId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  productId: string;
  batchId: string;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  timestamp: Date;
}
