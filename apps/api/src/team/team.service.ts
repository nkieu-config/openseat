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
  user: { displayName: string } | null;
};

export type TeamMemberView = {
  id: string;
  email: string;
  role: string;
  linked: boolean;
  displayName: string | null;
  createdAt: Date;
};

const MEMBER_INCLUDE = {
  user: { select: { displayName: true } },
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
    displayName: member.user?.displayName ?? null,
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
      include: MEMBER_INCLUDE,
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
        include: MEMBER_INCLUDE,
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
      include: MEMBER_INCLUDE,
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
