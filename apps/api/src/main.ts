import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('OpenSeat API')
    .setDescription('REST API for the OpenSeat ticketing platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.WEB_ORIGIN?.split(',') ?? true,
    credentials: true,
  });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
