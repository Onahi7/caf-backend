import { Injectable, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ClientSession } from 'mongoose';

/**
 * Service for managing MongoDB transactions
 * Provides helper methods for executing operations within ACID transactions
 */
@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(@InjectConnection() private readonly connection: Connection) {}

  /**
   * Execute a function within a MongoDB transaction
   * Automatically handles commit/rollback and session management
   *
   * @param fn - Async function to execute within transaction, receives session as parameter
   * @returns Result of the function execution
   * @throws Error if transaction fails
   *
   * @example
   * ```typescript
   * const result = await this.transactionService.executeInTransaction(async (session) => {
   *   await this.batchModel.updateOne({ _id: batchId }, { $inc: { quantity: -5 } }, { session });
   *   await this.saleModel.create([{ ... }], { session });
   *   return { success: true };
   * });
   * ```
   */
  async executeInTransaction<T>(
    fn: (session: ClientSession) => Promise<T>,
  ): Promise<T> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority', j: true },
        readPreference: 'primary',
      });

      this.logger.debug('Transaction started');

      const result = await fn(session);

      await session.commitTransaction();
      this.logger.debug('Transaction committed successfully');

      return result;
    } catch (error) {
      await session.abortTransaction();
      this.logger.error(
        'Transaction aborted due to error',
        (error as Error).stack,
      );
      throw error;
    } finally {
      session.endSession();
      this.logger.debug('Transaction session ended');
    }
  }

  /**
   * Execute multiple operations in a transaction with retry logic
   * Retries the transaction up to maxRetries times on transient errors
   *
   * @param fn - Async function to execute within transaction
   * @param maxRetries - Maximum number of retry attempts (default: 3)
   * @returns Result of the function execution
   * @throws Error if all retry attempts fail
   */
  async executeWithRetry<T>(
    fn: (session: ClientSession) => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeInTransaction(fn);
      } catch (error) {
        const err = error as any;
        lastError = err;

        // Check if error is retryable (transient transaction errors)
        const isRetryable =
          err.hasErrorLabel?.('TransientTransactionError') ||
          err.code === 112 || // WriteConflict
          err.code === 251; // NoSuchTransaction

        if (!isRetryable || attempt === maxRetries) {
          this.logger.error(
            `Transaction failed after ${attempt} attempt(s)`,
            err.stack,
          );
          throw error;
        }

        this.logger.warn(
          `Transaction attempt ${attempt} failed, retrying... (${err.message})`,
        );

        // Exponential backoff
        await this.sleep(Math.pow(2, attempt) * 100);
      }
    }

    throw lastError!;
  }

  /**
   * Check if the MongoDB connection supports transactions
   * @returns true if replica set is configured and transactions are supported
   */
  async supportsTransactions(): Promise<boolean> {
    try {
      const admin = this.connection.db!.admin();
      const status = await admin.command({ replSetGetStatus: 1 });
      return status.ok === 1;
    } catch (error) {
      this.logger.warn(
        'Replica set not configured, transactions not supported',
      );
      return false;
    }
  }

  /**
   * Get the current replica set status
   * Useful for health checks and monitoring
   */
  async getReplicaSetStatus(): Promise<any> {
    try {
      const admin = this.connection.db!.admin();
      return await admin.command({ replSetGetStatus: 1 });
    } catch (error) {
      this.logger.error(
        'Failed to get replica set status',
        (error as Error).stack,
      );
      throw error;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
