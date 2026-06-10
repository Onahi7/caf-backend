import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // Prevent unhandled Redis/connection errors from crashing the process.
  // When registered, Node.js will NOT auto-exit on uncaughtException.
  const isRedisError = (msg: string) =>
    msg.includes('max requests limit') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ReplyError') ||
    msg.includes('SimpleError') ||
    msg.includes('Connection');

  process.on('unhandledRejection', (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (isRedisError(msg)) {
      logger.warn(`Suppressed unhandled Redis rejection: ${msg}`);
      return;
    }
    logger.error(`Unhandled rejection: ${msg}`, reason instanceof Error ? reason.stack : undefined);
  });

  process.on('uncaughtException', (err: Error) => {
    const msg = err?.message ?? String(err);
    if (isRedisError(msg)) {
      logger.warn(`Suppressed uncaught Redis exception: ${msg}`);
      return;
    }
    logger.error(`Uncaught exception: ${msg}`, err.stack);
    // For non-Redis errors, let the default handler run
    process.exit(1);
  });

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
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'https://caf-frontend.dicksonhardy7.workers.dev',
    'https://caf-three-green.vercel.app',
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
      // Strip empty query params so @IsOptional @IsMongoId doesn't reject them
      forbidUnknownValues: false,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get<number>('PORT', 3000);

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('CAREFARM POS API')
    .setDescription('Pharmacy Point-of-Sale system API. Authenticate via /api/auth/login to get a Bearer token, then click Authorize below.')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token',
      },
      'access-token',
    )
    .addServer('http://localhost:3000', 'Local Development')
    .addServer('https://carefam-00c1641bcdf9.herokuapp.com', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      showRequestDuration: true,
    },
  });

  await app.listen(port);

  logger.log(`🚀 Application is running on: http://localhost:${port}`);
  logger.log(`🌐 CORS enabled for: ${allAllowedOrigins.join(', ')}`);
  logger.log(`📡 API endpoint: http://localhost:${port}/api`);
  logger.log(`📖 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
