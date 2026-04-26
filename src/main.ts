import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // HTTP security headers
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false, // allow Capacitor webview to load assets
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
        },
      },
    }),
  );

  // Get CORS origins from environment
  const corsOrigin = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:5173',
  );
  const allowedOrigins = corsOrigin.split(',').map((origin) => origin.trim());

  // Always-allowed frontend origins (hardcoded fallback)
  const hardcodedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://caf-frontend.dicksonhardy7.workers.dev',
  ];
  const allAllowedOrigins = [...new Set([...allowedOrigins, ...hardcodedOrigins])];

  // Enable CORS
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (like mobile apps or Postman)
      if (!origin) return callback(null, true);

      // Check if origin is in allowed list
      if (allAllowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        callback(null, true);
      } else {
        logger.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Idempotency-Key',
      'x-idempotency-key',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    maxAge: 3600, // Cache preflight requests for 1 hour
  });

  // Global prefix for all routes (optional)
  app.setGlobalPrefix('api', {
    exclude: ['health'], // Exclude health check from prefix
  });

  // Enable validation globally
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get<number>('PORT', 3000);
  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`🌐 CORS enabled for: ${allAllowedOrigins.join(', ')}`);
  logger.log(`📡 API endpoint: http://localhost:${port}/api`);
}
bootstrap();
