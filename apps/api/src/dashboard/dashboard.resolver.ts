import { UseGuards } from '@nestjs/common';
import { Args, ID, Int, Query, Resolver } from '@nestjs/graphql';
import { GqlAuthGuard, GqlCurrentUser } from '../auth/gql-auth';
import type { RequestUser } from '../auth/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { Attendee, EventCard, EventDashboard } from './dashboard.models';

@Resolver()
@UseGuards(GqlAuthGuard)
export class DashboardResolver {
  constructor(private readonly dashboard: DashboardService) {}

  @Query(() => [EventCard])
  organizerEvents(@GqlCurrentUser() user: RequestUser): Promise<EventCard[]> {
    return this.dashboard.organizerEvents(user.id);
  }

  @Query(() => EventDashboard)
  eventDashboard(
    @GqlCurrentUser() user: RequestUser,
    @Args('eventId', { type: () => ID }) eventId: string,
  ): Promise<EventDashboard> {
    return this.dashboard.eventDashboard(eventId, user.id);
  }

  @Query(() => [Attendee])
  eventAttendees(
    @GqlCurrentUser() user: RequestUser,
    @Args('eventId', { type: () => ID }) eventId: string,
    @Args('limit', { type: () => Int, nullable: true, defaultValue: 500 })
    limit: number,
  ): Promise<Attendee[]> {
    return this.dashboard.eventAttendees(eventId, user.id, limit);
  }
}
