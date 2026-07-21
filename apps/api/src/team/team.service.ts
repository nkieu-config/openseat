import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type MemberRecord = {
  id: string;
  email: string;
  role: string;
  userId: string | null;
  createdAt: Date;
};

export type TeamMemberView = {
  id: string;
  email: string;
  role: string;
  linked: boolean;
  createdAt: Date;
};

const MEMBER_SELECT = {
  id: true,
  email: true,
  role: true,
  userId: true,
  createdAt: true,
};

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function toView(member: MemberRecord): TeamMemberView {
  return {
    id: member.id,
    email: member.email,
    role: member.role,
    linked: member.userId !== null,
    createdAt: member.createdAt,
  };
}

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async list(eventId: string, userId: string): Promise<TeamMemberView[]> {
    await this.access.requireEventRole(eventId, userId, 'owner');
    const members = await this.prisma.teamMember.findMany({
      where: { eventId },
      select: MEMBER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
    return members.map(toView);
  }

  async add(
    eventId: string,
    userId: string,
    input: { email: string; role: 'manager' | 'staff' },
  ): Promise<TeamMemberView> {
    const { event } = await this.access.requireEventRole(
      eventId,
      userId,
      'owner',
    );
    const email = input.email.trim().toLowerCase();
    const organizer = await this.prisma.user.findUnique({
      where: { id: event.organizerId },
      select: { email: true },
    });
    if (organizer?.email === email) {
      throw new BadRequestException('The owner is already on the team');
    }
    const linkedUser = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    try {
      const member = await this.prisma.teamMember.create({
        data: {
          eventId,
          email,
          role: input.role,
          invitedById: userId,
          userId: linkedUser?.id ?? null,
          linkedAt: linkedUser ? new Date() : null,
        },
        select: MEMBER_SELECT,
      });
      return toView(member);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('This email is already on the team');
      }
      throw error;
    }
  }

  async changeRole(
    eventId: string,
    userId: string,
    memberId: string,
    role: 'manager' | 'staff',
  ): Promise<TeamMemberView> {
    await this.access.requireEventRole(eventId, userId, 'owner');
    const member = await this.prisma.teamMember.findFirst({
      where: { id: memberId, eventId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }
    const updated = await this.prisma.teamMember.update({
      where: { id: memberId },
      data: { role },
      select: MEMBER_SELECT,
    });
    return toView(updated);
  }

  async remove(
    eventId: string,
    userId: string,
    memberId: string,
  ): Promise<void> {
    await this.access.requireEventRole(eventId, userId, 'owner');
    const removed = await this.prisma.teamMember.deleteMany({
      where: { id: memberId, eventId },
    });
    if (removed.count === 0) {
      throw new NotFoundException('Team member not found');
    }
  }
}
