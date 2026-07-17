import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

export type OrderConfirmationEmail = {
  to: string;
  buyerName: string;
  eventTitle: string;
  eventVenue: string;
  eventStartsAt: Date;
  orderId: string;
  guestToken: string;
  ticketNames: string[];
};

export type RefundNoticeEmail = {
  to: string;
  buyerName: string;
  eventTitle: string;
  amountSatang: number;
  orderId: string;
  guestToken: string;
};

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly appOrigin: string;

  constructor(config: ConfigService) {
    const port = Number(config.get('SMTP_PORT') ?? 1025);
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST') ?? 'localhost',
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });
    this.from =
      config.get<string>('MAIL_FROM') ?? 'OpenSeat <tickets@openseat.local>';
    this.appOrigin =
      config.get<string>('APP_ORIGIN') ?? 'http://localhost:3000';
  }

  async sendOrderConfirmation(email: OrderConfirmationEmail): Promise<void> {
    const orderUrl = `${this.appOrigin}/orders/${email.orderId}?token=${email.guestToken}`;
    const ticketList = email.ticketNames
      .map((name) => `<li>${name}</li>`)
      .join('');
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: `Your tickets for ${email.eventTitle}`,
        html: [
          `<p>Hi ${email.buyerName},</p>`,
          `<p>You're going to <strong>${email.eventTitle}</strong>!</p>`,
          `<p>${email.eventVenue} · ${email.eventStartsAt.toUTCString()}</p>`,
          `<ul>${ticketList}</ul>`,
          `<p><a href="${orderUrl}">View your tickets and QR codes</a></p>`,
          `<p>Show the QR code at the door to check in.</p>`,
        ].join('\n'),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send order confirmation for order ${email.orderId}: ${String(error)}`,
      );
    }
  }

  async sendRefundNotice(email: RefundNoticeEmail): Promise<void> {
    const orderUrl = `${this.appOrigin}/orders/${email.orderId}?token=${email.guestToken}`;
    const amount = `฿${(email.amountSatang / 100).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: email.to,
        subject: `Your refund for ${email.eventTitle}`,
        html: [
          `<p>Hi ${email.buyerName},</p>`,
          `<p>We've refunded <strong>${amount}</strong> for <strong>${email.eventTitle}</strong>.</p>`,
          `<p>The refunded tickets are no longer valid for entry.</p>`,
          `<p><a href="${orderUrl}">View your order</a></p>`,
        ].join('\n'),
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send refund notice for order ${email.orderId}: ${String(error)}`,
      );
    }
  }
}
