import type { components } from './api';

export type { paths, components } from './api';

export const API_PREFIX = '/api';

type Schemas = components['schemas'];

export type PublicUser = Schemas['PublicUserDto'];
export type AuthResponse = Schemas['AuthResponseDto'];
export type TicketTypePublic = Schemas['TicketTypePublicDto'];
export type EventSummary = Schemas['EventSummaryDto'];
export type EventDetail = Schemas['EventDetailDto'];
export type MyEvent = Schemas['MyEventDto'];
export type SeatInfo = Schemas['SeatInfoDto'];
export type SeatMapSectionMeta = Schemas['SeatMapSectionMetaDto'];
export type SeatMapData = Schemas['SeatMapDataDto'];
export type SeatLabel = Schemas['SeatLabelDto'];
export type OrderTicket = Schemas['OrderTicketDto'];
export type OrderDetail = Schemas['OrderDetailDto'];
export type MyTicket = Schemas['MyTicketDto'];
export type TeamMember = Schemas['TeamMemberDto'];
export type CheckinResult = Schemas['CheckinResultDto'];
export type Hold = Schemas['HoldDto'];

export type SeatStatus = SeatInfo['status'];
export type TicketStatus = OrderTicket['status'];

export type SeatsChangedMessage = {
  held: string[];
  released: string[];
  sold: string[];
};

export type HealthResponse = {
  status: 'ok';
  uptimeSeconds: number;
  version: string;
};
