import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

export const DEMO_EMAILS = {
  buyer: 'demo-buyer@openseat.dev',
  organizer: 'demo-organizer@openseat.dev',
} as const;

export type DemoRole = keyof typeof DEMO_EMAILS;

@Injectable()
export class DemoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async loginAs(role: DemoRole) {
    const user = await this.prisma.user.findFirst({
      where: { email: DEMO_EMAILS[role], isDemo: true },
    });
    if (!user) {
      throw new ServiceUnavailableException('Demo accounts are not seeded yet');
    }
    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        isDemo: user.isDemo,
      },
      tokens: await this.auth.issueTokens(user),
    };
  }
}
