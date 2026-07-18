import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ROLE_RANK = { staff: 1, manager: 2, owner: 3 } as const;

export type EventRoleName = keyof typeof ROLE_RANK;

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async membershipRole(
    eventId: string,
    userId: string,
  ): Promise<EventRoleName | null> {
    const member = await this.prisma.teamMember.findFirst({
      where: { eventId, userId },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async resolveRole(eventId: string, userId: string) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    const role =
      event.organizerId === userId
        ? ('owner' as const)
        : await this.membershipRole(eventId, userId);
    return { event, role };
  }

  async requireEventRole(
    eventId: string,
    userId: string,
    minRole: EventRoleName,
  ) {
    const { event, role } = await this.resolveRole(eventId, userId);
    if (!role) {
      throw new NotFoundException('Event not found');
    }
    if (ROLE_RANK[role] < ROLE_RANK[minRole]) {
      throw new ForbiddenException('Your role does not allow this');
    }
    return { event, role };
  }
}
