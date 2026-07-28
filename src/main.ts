import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');

  //  security
  // app.use(helmet());
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    Credentials: true,
  });

  //  global prefix with versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1', // routes become /api/v1/
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      forbidNonWhitelisted: true,
      whitelist: true,
    }),
  );

  // Generate OpenAPI document using NestJS Swagger
  const config = new DocumentBuilder()
    .setTitle('Medimind API')
    .setDescription('The API description here...')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT access token',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // 2. Serve Scalar documentation at /api/docs
  app.use(
    '/api/v1/docs',
    apiReference({
      content: document,
      // Optional: theme: 'alternate', // or 'default', 'moon', 'purple'
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
  logger.log(`Application running on http://localhost:3000`);
  logger.log(`Swagger docs available at http://localhost:3000/api/v1/docs`);
}
bootstrap();
