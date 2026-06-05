import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false }),
  );

  app.useLogger(app.get(Logger));

  // Security headers — cast required due to pnpm fastify peer version deduplication
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const helmet = require('@fastify/helmet');
  await app.register(helmet as Parameters<typeof app.register>[0], {
    contentSecurityPolicy: false,
  });

  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  if (process.env.SWAGGER_ENABLED !== 'false') {
    const docConfig = new DocumentBuilder()
      .setTitle(process.env.APP_NAME ?? 'wreislab-nestjs-template')
      .setDescription('WReisLab NestJS Template API — JWT/OIDC authentication with RBAC')
      .setVersion(process.env.APP_VERSION ?? '0.1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, docConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = parseInt(process.env.PORT ?? '3000', 10);
  // '0.0.0.0' required for Docker (Fastify default is 127.0.0.1)
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`Application running on port ${port}`, 'Bootstrap');
  if (process.env.SWAGGER_ENABLED !== 'false') {
    logger.log(`Swagger UI: http://localhost:${port}/docs`, 'Bootstrap');
  }
}

bootstrap();
