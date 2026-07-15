import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  type RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PaymentsService, type PaymockWebhookEvent } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('webhook')
  @HttpCode(200)
  @SkipThrottle()
  async webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paymock-signature') signature?: string,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody || rawBody.length === 0) {
      throw new BadRequestException('Missing webhook body');
    }
    this.payments.verifySignature(signature, rawBody);
    const event = JSON.parse(rawBody.toString('utf8')) as PaymockWebhookEvent;
    if (!event.id || !event.intentId || !event.orderId) {
      throw new BadRequestException('Malformed webhook event');
    }
    const fresh = await this.payments.recordEvent(event);
    if (!fresh) {
      return { received: true, duplicate: true };
    }
    await this.payments.processEvent(event);
    return { received: true };
  }
}
