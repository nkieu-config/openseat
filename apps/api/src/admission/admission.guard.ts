import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { admissionsVerified } from '../telemetry/metrics';

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

@Injectable()
export class AdmissionGuard implements CanActivate {
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>('GATE_ADMISSION_SECRET');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { params: { eventId?: string } }>();
    const eventId = request.params.eventId;
    if (!eventId) {
      return true;
    }
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { dropMode: true },
    });
    if (!event || !event.dropMode) {
      return true;
    }
    const header = request.headers['x-admission-token'];
    const token = Array.isArray(header) ? header[0] : header;
    if (!token || !this.isValid(token, eventId)) {
      admissionsVerified.add(1, { result: 'rejected' });
      throw new ForbiddenException({
        code: 'ADMISSION_REQUIRED',
        message: 'Join the waiting room to enter this on-sale',
      });
    }
    admissionsVerified.add(1, { result: 'valid' });
    return true;
  }

  private isValid(token: string, eventId: string): boolean {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }
    const [header, payload, signature] = parts;
    const expected = createHmac('sha256', this.secret)
      .update(`${header}.${payload}`)
      .digest('base64url');
    if (!safeEqual(expected, signature)) {
      return false;
    }
    try {
      const claims = JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as { eventId?: string; exp?: number };
      if (claims.eventId !== eventId) {
        return false;
      }
      if (!claims.exp || Date.now() / 1000 >= claims.exp) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }
}
