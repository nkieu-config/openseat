import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaymockIntent = {
  intentId: string;
  checkoutUrl: string;
  status: string;
};

const INTENT_TIMEOUT_MS = 90_000;

@Injectable()
export class PaymockClientService {
  private readonly logger = new Logger(PaymockClientService.name);

  constructor(private readonly config: ConfigService) {}

  webhookSecret(): string {
    return this.config.getOrThrow<string>('PAYMOCK_WEBHOOK_SECRET');
  }

  async createIntent(input: {
    orderId: string;
    amountSatang: number;
    guestToken: string;
  }): Promise<PaymockIntent> {
    const paymockUrl =
      this.config.get<string>('PAYMOCK_URL') ?? 'http://localhost:4100';
    const apiKey =
      this.config.get<string>('PAYMOCK_API_KEY') ?? 'paymock-dev-key';
    const apiPublicUrl =
      this.config.get<string>('API_PUBLIC_URL') ?? 'http://localhost:4000';
    const appOrigin =
      this.config.get<string>('APP_ORIGIN') ?? 'http://localhost:3000';

    try {
      const response = await fetch(`${paymockUrl}/intents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          orderId: input.orderId,
          amountSatang: input.amountSatang,
          currency: 'THB',
          callbackUrl: `${apiPublicUrl}/api/payments/webhook`,
          returnUrl: `${appOrigin}/orders/${input.orderId}?token=${input.guestToken}`,
        }),
        signal: AbortSignal.timeout(INTENT_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`paymock responded ${response.status}`);
      }
      return (await response.json()) as PaymockIntent;
    } catch (error) {
      this.logger.error(
        `Payment intent creation failed for order ${input.orderId}: ${String(error)}`,
      );
      throw new BadGatewayException(
        'The payment provider is unavailable — try again shortly',
      );
    }
  }
}
