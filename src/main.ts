import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { ValidationPipe, VersioningType } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
    '/api/docs',
    apiReference({
      content: document,
      // Optional: theme: 'alternate', // or 'default', 'moon', 'purple'
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
