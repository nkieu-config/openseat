import {
  Field,
  Float,
  GraphQLISODateTime,
  ID,
  Int,
  ObjectType,
} from '@nestjs/graphql';

@ObjectType()
export class EventCard {
  @Field(() => ID) id!: string;
  @Field() slug!: string;
  @Field() title!: string;
  @Field() status!: string;
  @Field() venueName!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field() isDemo!: boolean;
  @Field() seated!: boolean;
  @Field(() => Int) capacity!: number;
  @Field(() => Int) ticketsSold!: number;
  @Field(() => Int) ticketsCheckedIn!: number;
  @Field(() => Float) grossSatang!: number;
}

@ObjectType()
export class DashboardTotals {
  @Field(() => Float) grossSatang!: number;
  @Field(() => Int) paidOrders!: number;
  @Field(() => Int) pendingOrders!: number;
  @Field(() => Int) ticketsSold!: number;
  @Field(() => Int) ticketsCheckedIn!: number;
  @Field(() => Int) liveHolds!: number;
  @Field(() => Int) capacity!: number;
  @Field(() => Int) sellThroughBp!: number;
}

@ObjectType()
export class TimelineBucket {
  @Field(() => GraphQLISODateTime) day!: Date;
  @Field(() => Int) orders!: number;
  @Field(() => Int) ticketsSold!: number;
  @Field(() => Float) grossSatang!: number;
}

@ObjectType()
export class TierStat {
  @Field(() => ID) id!: string;
  @Field() name!: string;
  @Field() kind!: string;
  @Field(() => Float) priceSatang!: number;
  @Field(() => Int) quantity!: number;
  @Field(() => Int) remaining!: number;
  @Field(() => Int) sold!: number;
  @Field(() => Float) grossSatang!: number;
}

@ObjectType()
export class SectionOccupancy {
  @Field() name!: string;
  @Field(() => Int) capacity!: number;
  @Field(() => Int) sold!: number;
  @Field(() => Int) held!: number;
  @Field(() => Int) available!: number;
}

@ObjectType()
export class EventDashboard {
  @Field(() => EventCard) event!: EventCard;
  @Field(() => DashboardTotals) totals!: DashboardTotals;
  @Field(() => [TimelineBucket]) timeline!: TimelineBucket[];
  @Field(() => [TierStat]) tiers!: TierStat[];
  @Field(() => [SectionOccupancy]) sections!: SectionOccupancy[];
}

@ObjectType()
export class Attendee {
  @Field(() => ID) ticketId!: string;
  @Field() name!: string;
  @Field() email!: string;
  @Field() ticketType!: string;
  @Field(() => String, { nullable: true }) seat!: string | null;
  @Field() status!: string;
  @Field(() => GraphQLISODateTime, { nullable: true })
  checkedInAt!: Date | null;
}

@ObjectType()
export class OrderTicketRow {
  @Field(() => ID) id!: string;
  @Field() ticketType!: string;
  @Field(() => String, { nullable: true }) seat!: string | null;
  @Field() status!: string;
  @Field(() => Float) priceSatang!: number;
}

@ObjectType()
export class OrderRow {
  @Field(() => ID) id!: string;
  @Field() buyerName!: string;
  @Field() buyerEmail!: string;
  @Field() status!: string;
  @Field(() => Float) totalSatang!: number;
  @Field(() => Float) refundedSatang!: number;
  @Field(() => GraphQLISODateTime) createdAt!: Date;
  @Field(() => [OrderTicketRow]) tickets!: OrderTicketRow[];
}
