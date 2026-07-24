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
  @Field(() => Float, { nullable: true }) grossSatang!: number | null;
  @Field() myRole!: string;
}

@ObjectType()
export class EventSummary {
  @Field(() => ID) id!: string;
  @Field() title!: string;
  @Field() venueName!: string;
  @Field(() => GraphQLISODateTime) startsAt!: Date;
  @Field() status!: string;
  @Field(() => Int) ticketsSold!: number;
  @Field(() => Int) ticketsCheckedIn!: number;
  @Field() myRole!: string;
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
  @Field(() => Int) issued!: number;
  @Field(() => Int) claimed!: number;
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
  @Field() myRole!: string;
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
export class RefundRow {
  @Field(() => ID) id!: string;
  @Field() status!: string;
  @Field(() => Float) amountSatang!: number;
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
  @Field(() => [RefundRow]) refunds!: RefundRow[];
}
