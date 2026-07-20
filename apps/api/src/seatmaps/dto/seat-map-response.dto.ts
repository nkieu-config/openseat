export class SeatInfoDto {
  id: string;
  section: string;
  rowLabel: string;
  number: number;
  x: number;
  y: number;
  ticketTypeId: string;
  status: 'available' | 'held' | 'sold';
  mine: boolean;
  expiresAt?: string;
}

export class SeatMapSectionMetaDto {
  name: string;
  yStart: number;
  rows: number;
  cols: number;
  xOffset: number;
}

export class SeatMapMetaDto {
  maxCols: number;
  totalRows: number;
  sections: SeatMapSectionMetaDto[];
}

export class SeatMapTierDto {
  id: string;
  name: string;
  priceSatang: number;
  remaining: number;
}

export class SeatMapDataDto {
  id: string;
  template: string;
  meta: SeatMapMetaDto;
  tiers: SeatMapTierDto[];
  seats: SeatInfoDto[];
}
