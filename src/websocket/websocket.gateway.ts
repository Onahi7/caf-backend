import {
  WebSocketGateway as WSGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { JwtService } from '@nestjs/jwt';
import { OnEvent } from '@nestjs/event-emitter';
import type {
  InventoryUpdateEvent,
  BatchUpdateEvent,
  SaleUpdateEvent,
  TransferUpdateEvent,
  ReconciliationVarianceEvent,
  NotificationCreatedEvent,
} from './events.service.js';
import { CurrencyUtil } from '../common/utils/currency.util.js';
import { PAYMENT_METHOD_LABELS } from '../common/constants/payment-methods.constant.js';

/**
 * WebSocket Gateway for real-time inventory updates
 * Implements branch-based rooms for filtered broadcasting
 */
@WSGateway({
  namespace: '/inventory',
})
export class WebSocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebSocketGateway.name);
  private pubClient!: ReturnType<typeof createClient>;
  private subClient!: ReturnType<typeof createClient>;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  private isOriginAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return true;
    }

    const corsOrigin = this.configService.get<string>(
      'CORS_ORIGIN',
      'http://localhost:5173',
    );
    const allowedOrigins = corsOrigin.split(',').map((value) => value.trim());
    const mobileOrigins = [
      'http://localhost',
      'https://localhost',
      'capacitor://localhost',
    ];
    const frontendOrigins = [
      'http://localhost:5173',
      'http://localhost:3000',
      'https://caf-frontend.dicksonhardy7.workers.dev',
      'https://caf-three-green.vercel.app',
    ];
    const allAllowedOrigins = [
      ...new Set([...allowedOrigins, ...mobileOrigins, ...frontendOrigins]),
    ];

    return allowedOrigins.includes('*') || allAllowedOrigins.includes(origin);
  }

  /**
   * Initialize WebSocket gateway with Redis adapter
   */
  async afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');

    type EngineLike = {
      on: (
        event: 'headers',
        listener: (
          headers: Record<string, string>,
          request: { headers: { origin?: string } },
        ) => void,
      ) => void;
    };

    const serverLike = server as unknown as {
      engine?: EngineLike;
      server?: { engine?: EngineLike };
    };
    const engine = serverLike.engine ?? serverLike.server?.engine;

    if (engine) {
      engine.on('headers', (headers, request) => {
        const origin = request.headers.origin;

        if (this.isOriginAllowed(origin)) {
          headers['Access-Control-Allow-Origin'] = origin || '*';
          headers['Access-Control-Allow-Credentials'] = 'true';
        }
      });
    } else {
      this.logger.warn(
        'Socket engine unavailable during afterInit; skipping headers hook',
      );
    }

    server.use((socket, next) => {
      const origin = socket.handshake.headers.origin;

      if (!this.isOriginAllowed(origin)) {
        this.logger.warn(`WebSocket blocked origin: ${origin}`);
        return next(new Error('Not allowed by CORS'));
      }

      next();
    });

    // Check if Redis is enabled
    const enableRedis = this.configService.get<string>('ENABLE_REDIS', 'true');
    if (enableRedis === 'false' || enableRedis === '0') {
      this.logger.log('Redis is disabled - running in single instance mode');
      return;
    }

    try {
      // Create Redis clients for Socket.io adapter
      const redisUrl =
        this.configService.get<string>('REDIS_URL') ||
        this.configService.get<string>('KV_URL');
      const redisHost = this.configService.get<string>(
        'REDIS_HOST',
        'localhost',
      );
      const redisPort = this.configService.get<number>('REDIS_PORT', 6379);
      const redisPassword = this.configService.get<string>('REDIS_PASSWORD');

      this.pubClient = redisUrl
        ? createClient({ url: redisUrl, disableOfflineQueue: true })
        : createClient({
            socket:
              this.configService.get<string>('REDIS_TLS') === 'true'
                ? { host: redisHost, port: redisPort, tls: true }
                : { host: redisHost, port: redisPort },
            password: redisPassword,
            disableOfflineQueue: true,
          });

      this.subClient = this.pubClient.duplicate();

      // Handle Redis connection errors — log but do not propagate
      this.pubClient.on('error', (err: Error) => {
        this.logger.error('Redis Pub Client Error:', err);
      });

      this.subClient.on('error', (err: Error) => {
        this.logger.error('Redis Sub Client Error:', err);
      });

      // Connect Redis clients — if this fails, skip Redis adapter gracefully
      await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

      // Set up Redis adapter for Socket.io
      const socketServer = (server as unknown as { server?: Server }).server ?? server;
      if (typeof socketServer.adapter === 'function') {
        socketServer.adapter(createAdapter(this.pubClient, this.subClient));
      } else {
        this.logger.warn(
          'Socket.io adapter function unavailable; continuing without Redis adapter',
        );
      }

      this.logger.log('Redis adapter configured for Socket.io');
    } catch (error) {
      this.logger.error('Failed to initialize Redis adapter — running without Redis:', error);
      // Clean up partially connected clients
      try { this.pubClient?.disconnect?.(); } catch {}
      try { this.subClient?.disconnect?.(); } catch {}
      // Continue without Redis adapter (single instance mode)
    }
  }

  /**
   * Handle client connection
   * Authenticate user and join branch-specific rooms
   */
  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      // Verify JWT token
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      // Store user info in socket data
      client.data.userId = payload.sub;
      client.data.role = payload.role;
      client.data.branchId = payload.branchId;

      // Join user-specific room (for notifications)
      await client.join(`user:${payload.sub}`);
      this.logger.log(`Client ${client.id} joined user room: ${payload.sub}`);

      // Join branch-specific room if user has a branch
      if (payload.branchId) {
        await client.join(`branch:${payload.branchId}`);
        this.logger.log(
          `Client ${client.id} joined branch room: ${payload.branchId}`,
        );
      }

      // Super admins join all branches room
      if (payload.role === 'super_admin') {
        await client.join('branch:all');
        this.logger.log(`Client ${client.id} joined all branches room`);
      }

      this.logger.log(
        `Client connected: ${client.id} (User: ${payload.sub}, Role: ${payload.role})`,
      );
    } catch (error) {
      this.logger.error(
        `Authentication failed for client ${client.id}:`,
        error,
      );
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Broadcast inventory update to branch-specific room
   * @param branchId Branch identifier
   * @param update Inventory update data
   */
  broadcastInventoryUpdate(branchId: string, update: InventoryUpdateDto) {
    const room = `branch:${branchId}`;
    this.server.to(room).emit('inventory:update', update);
    this.logger.debug(`Broadcasted inventory update to room: ${room}`);
  }

  /**
   * Broadcast inventory update to all branches
   * @param update Inventory update data
   */
  broadcastInventoryUpdateToAll(update: InventoryUpdateDto) {
    this.server.to('branch:all').emit('inventory:update', update);
    this.logger.debug('Broadcasted inventory update to all branches');
  }

  /**
   * Broadcast batch update to branch-specific room
   * @param branchId Branch identifier
   * @param update Batch update data
   */
  broadcastBatchUpdate(branchId: string, update: BatchUpdateDto) {
    const room = `branch:${branchId}`;
    this.server.to(room).emit('batch:update', update);
    this.logger.debug(`Broadcasted batch update to room: ${room}`);
  }

  /**
   * Broadcast sale completion to branch-specific room
   * @param branchId Branch identifier
   * @param update Sale update data
   */
  broadcastSaleUpdate(branchId: string, update: SaleUpdateDto) {
    const room = `branch:${branchId}`;
    this.server.to(room).emit('sale:update', update);
    this.logger.debug(`Broadcasted sale update to room: ${room}`);
  }

  /**
   * Broadcast transfer update to relevant branches
   * @param sourceBranchId Source branch identifier
   * @param destinationBranchId Destination branch identifier
   * @param update Transfer update data
   */
  broadcastTransferUpdate(
    sourceBranchId: string,
    destinationBranchId: string,
    update: TransferUpdateDto,
  ) {
    this.server.to(`branch:${sourceBranchId}`).emit('transfer:update', update);
    this.server
      .to(`branch:${destinationBranchId}`)
      .emit('transfer:update', update);
    this.logger.debug(
      `Broadcasted transfer update to branches: ${sourceBranchId}, ${destinationBranchId}`,
    );
  }

  /**
   * Handle ping message for connection health check
   */
  @SubscribeMessage('ping')
  handlePing(): string {
    return 'pong';
  }

  /**
   * Listen to inventory update events and broadcast to clients
   */
  @OnEvent('inventory.updated')
  handleInventoryUpdateEvent(event: InventoryUpdateEvent) {
    this.broadcastInventoryUpdate(event.branchId, {
      batchId: event.batchId ?? event.productId,
      productId: event.productId,
      branchId: event.branchId,
      quantityAvailable: event.quantityAvailable,
      updateType: event.updateType,
      timestamp: event.timestamp,
    });
  }

  /**
   * Listen to batch update events and broadcast to clients
   */
  @OnEvent('batch.updated')
  handleBatchUpdateEvent(event: BatchUpdateEvent) {
    this.broadcastBatchUpdate(event.branchId, {
      batchId: event.batchId,
      productId: event.productId,
      branchId: event.branchId,
      quantityAvailable: event.quantityAvailable,
      isExpired: event.isExpired,
      isDepleted: event.isDepleted,
      updateType: event.updateType,
      timestamp: event.timestamp,
    });
  }

  /**
   * Listen to sale update events and broadcast to clients
   */
  @OnEvent('sale.updated')
  handleSaleUpdateEvent(event: SaleUpdateEvent) {
    // Format currency and get payment method label

    this.broadcastSaleUpdate(event.branchId, {
      saleId: event.saleId,
      branchId: event.branchId,
      shiftId: event.shiftId,
      total: event.total,
      totalFormatted: CurrencyUtil.format(event.total),
      paymentMethod: event.paymentMethod,
      paymentMethodLabel:
        PAYMENT_METHOD_LABELS[event.paymentMethod] || event.paymentMethod,
      paymentReference: event.paymentReference,
      items: event.items,
      updateType: event.updateType,
      timestamp: event.timestamp,
    });
  }

  /**
   * Listen to transfer update events and broadcast to clients
   */
  @OnEvent('transfer.updated')
  handleTransferUpdateEvent(event: TransferUpdateEvent) {
    this.broadcastTransferUpdate(
      event.sourceBranchId,
      event.destinationBranchId,
      {
        transferId: event.transferId,
        sourceBranchId: event.sourceBranchId,
        destinationBranchId: event.destinationBranchId,
        productId: event.productId,
        batchId: event.batchId ?? event.productId,
        quantity: event.quantity,
        status: event.status,
        timestamp: event.timestamp,
      },
    );
  }

  /**
   * Listen to reconciliation variance events and broadcast to branch room
   */
  @OnEvent('reconciliation.variance')
  handleReconciliationVarianceEvent(event: ReconciliationVarianceEvent) {
    this.broadcastReconciliationVariance(event.branchId, {
      reconciliationId: event.reconciliationId,
      branchId: event.branchId,
      period: event.period,
      source: event.source,
      expectedCash: event.expectedCash,
      actualCash: event.actualCash,
      discrepancy: event.discrepancy,
      severity: event.severity,
      createdBy: event.createdBy,
      timestamp: event.timestamp,
    });
  }

  /**
   * Broadcast reconciliation variance to branch room and super-admin room
   */
  broadcastReconciliationVariance(branchId: string, payload: ReconciliationVarianceDto) {
    this.server.to(`branch:${branchId}`).emit('reconciliation:variance', payload);
    this.server.to('branch:all').emit('reconciliation:variance', payload);
    this.logger.warn(
      `Reconciliation variance alert broadcast: branch ${branchId} period ${payload.period} discrepancy ${payload.discrepancy} (${payload.severity})`,
    );
  }

  /**
   * Broadcast notification to the specific user's room
   */
  broadcastNotification(userId: string, payload: NotificationDto) {
    this.server.to(`user:${userId}`).emit('notification:new', payload);
    this.logger.debug(`Broadcasted notification to user: ${userId}`);
  }

  /**
   * Listen to notification.created events and broadcast to user
   */
  @OnEvent('notification.created')
  handleNotificationCreatedEvent(event: NotificationCreatedEvent) {
    this.broadcastNotification(event.userId, {
      notificationId: event.notificationId,
      type: event.type,
      title: event.title,
      message: event.message,
      severity: event.severity,
      link: event.link,
      createdAt: event.createdAt,
    });
  }
}

/**
 * DTO for inventory update messages
 */
export interface InventoryUpdateDto {
  batchId?: string;
  productId: string;
  branchId: string;
  quantityAvailable: number;
  updateType: 'sale' | 'purchase' | 'transfer' | 'adjustment' | 'return';
  timestamp: Date;
}

/**
 * DTO for batch update messages
 */
export interface BatchUpdateDto {
  batchId: string;
  productId: string;
  branchId: string;
  quantityAvailable: number;
  isExpired?: boolean;
  isDepleted?: boolean;
  updateType: 'created' | 'updated' | 'depleted' | 'expired';
  timestamp: Date;
}

/**
 * DTO for sale update messages
 */
export interface SaleUpdateDto {
  saleId: string;
  branchId: string;
  shiftId: string;
  total: number;
  totalFormatted: string;
  paymentMethod: string;
  paymentMethodLabel: string;
  paymentReference?: string;
  items: Array<{
    productId: string;
    batchId?: string;
    quantity: number;
  }>;
  updateType: 'completed' | 'returned' | 'partially_returned';
  timestamp: Date;
}

/**
 * DTO for transfer update messages
 */
export interface TransferUpdateDto {
  transferId: string;
  sourceBranchId: string;
  destinationBranchId: string;
  productId: string;
  batchId: string;
  quantity: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  timestamp: Date;
}

export interface ReconciliationVarianceDto {
  reconciliationId: string;
  branchId: string;
  period: string;
  source: 'caf' | 'emr' | 'lab';
  expectedCash: number;
  actualCash: number;
  discrepancy: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdBy: string;
  timestamp: Date;
}

export interface NotificationDto {
  notificationId: string;
  type: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  link?: string;
  createdAt: Date;
}
