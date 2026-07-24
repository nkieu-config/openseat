import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../app.module';
import { buildSwaggerConfig } from '../swagger';

async function dump() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    preview: true,
  });
  app.setGlobalPrefix('api');
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
  const target = join(
    __dirname,
    '..',
    '..',
    '..',
    '..',
    'packages',
    'contracts',
    'openapi.json',
  );
  writeFileSync(target, `${JSON.stringify(document, null, 2)}\n`);
  await app.close();
  process.stdout.write(`OpenAPI schema written to ${target}\n`);
}

void dump();
