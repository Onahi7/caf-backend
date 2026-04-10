import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import mongoose from 'mongoose';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const responseObj = exceptionResponse as any;
        message = responseObj.message || message;
        error = responseObj.error || error;
      }
    } else if (exception instanceof mongoose.Error.ValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Validation failed';
      error = 'Bad Request';
      // Extract validation errors
      const errors = Object.values(exception.errors).map((err: any) => ({
        field: err.path,
        message: err.message,
      }));
      message = JSON.stringify(errors);
    } else if (exception instanceof mongoose.Error.CastError) {
      status = HttpStatus.BAD_REQUEST;
      message = `Invalid ${exception.path}: ${exception.value}`;
      error = 'Bad Request';
    } else if (
      exception &&
      typeof exception === 'object' &&
      'code' in exception
    ) {
      const err = exception as any;
      if (err.code === 11000) {
        // Duplicate key error
        status = HttpStatus.CONFLICT;
        message = 'Duplicate entry';
        error = 'Conflict';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'Database operation failed';
        error = 'Bad Request';
      }
    } else if (exception instanceof Error) {
      // Log the error for debugging
      this.logger.error(
        `Unhandled error: ${exception.message}`,
        exception.stack,
      );
      message = 'An unexpected error occurred';
    }

    // Log all non-4xx errors
    if (status >= 500) {
      this.logger.error(
        `Server Error: ${exception}`,
        (exception as any)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
    });
  }
}
