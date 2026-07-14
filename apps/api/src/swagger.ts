import { DocumentBuilder } from '@nestjs/swagger';

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle('OpenSeat API')
    .setDescription('REST API for the OpenSeat ticketing platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}
