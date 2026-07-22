import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { admissionsVerified } from '../telemetry/metrics';
import { verifyAdmissionToken } from './admission-token';

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
    if (!token || !verifyAdmissionToken(this.secret, token, eventId)) {
      admissionsVerified.add(1, { result: 'rejected' });
      throw new ForbiddenException({
        code: 'ADMISSION_REQUIRED',
        message: 'Join the waiting room to enter this on-sale',
      });
    }
    admissionsVerified.add(1, { result: 'valid' });
    return true;
  }
}
