export class TicketTypePublicDto {
  id!: string;
  kind!: 'ga' | 'seated';
  name!: string;
  priceSatang!: number;
  quantity!: number;
  remaining!: number;
  maxPerOrder!: number;
}

export class EventOrganizerDto {
  id!: string;
  displayName!: string;
}

export class EventSeatMapRefDto {
  id!: string;
}

export class EventSummaryDto {
  id!: string;
  slug!: string;
  title!: string;
  venueName!: string;
  startsAt!: string;
}

export class EventDetailDto extends EventSummaryDto {
  description!: string;
  endsAt!: string | null;
  status!: 'draft' | 'published';
  coverImageUrl!: string | null;
  isDemo!: boolean;
  dropMode!: boolean;
  saleOpensAt!: string | null;
  organizer!: EventOrganizerDto;
  ticketTypes!: TicketTypePublicDto[];
  seatMap!: EventSeatMapRefDto | null;
}

export class MyEventDto extends EventSummaryDto {
  description!: string;
  endsAt!: string | null;
  status!: 'draft' | 'published';
  coverImageUrl!: string | null;
  isDemo!: boolean;
  dropMode!: boolean;
  saleOpensAt!: string | null;
  ticketTypes!: TicketTypePublicDto[];
  seatMap!: EventSeatMapRefDto | null;
  ticketsIssued!: number;
}
