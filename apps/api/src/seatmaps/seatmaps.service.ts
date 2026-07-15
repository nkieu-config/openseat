import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSeatMapDto } from './seatmaps.controller';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SECTION_GAP_ROWS = 1;

@Injectable()
export class SeatmapsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(eventId: string, organizerId: string, dto: CreateSeatMapDto) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, organizerId },
      include: { seatMap: { select: { id: true } } },
    });
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    if (event.seatMap) {
      throw new ConflictException('This event already has a seat map');
    }
    const tierNames = dto.sections.map((section) => section.tierName.trim());
    if (new Set(tierNames).size !== tierNames.length) {
      throw new BadRequestException('Each section needs a distinct tier name');
    }

    const maxCols = Math.max(...dto.sections.map((section) => section.cols));

    return this.prisma.$transaction(async (tx) => {
      let yCursor = 0;
      const sectionMeta: {
        name: string;
        yStart: number;
        rows: number;
        cols: number;
        xOffset: number;
      }[] = [];

      const seatMap = await tx.seatMap.create({
        data: { eventId, template: 'theater', meta: {} },
      });

      for (const section of dto.sections) {
        const xOffset = Math.floor((maxCols - section.cols) / 2);
        const ticketType = await tx.ticketType.create({
          data: {
            eventId,
            kind: 'seated',
            name: section.tierName.trim(),
            priceSatang: 0,
            quantity: section.rows * section.cols,
            remaining: section.rows * section.cols,
            maxPerOrder: 8,
          },
        });
        await tx.seat.createMany({
          data: Array.from({ length: section.rows }, (_, rowIndex) =>
            Array.from({ length: section.cols }, (_, colIndex) => ({
              seatMapId: seatMap.id,
              eventId,
              ticketTypeId: ticketType.id,
              section: section.name.trim(),
              rowLabel: ROW_LETTERS[rowIndex % ROW_LETTERS.length],
              number: colIndex + 1,
              x: xOffset + colIndex,
              y: yCursor + rowIndex,
            })),
          ).flat(),
        });
        sectionMeta.push({
          name: section.name.trim(),
          yStart: yCursor,
          rows: section.rows,
          cols: section.cols,
          xOffset,
        });
        yCursor += section.rows + SECTION_GAP_ROWS;
      }

      return tx.seatMap.update({
        where: { id: seatMap.id },
        data: {
          meta: {
            maxCols,
            totalRows: yCursor - SECTION_GAP_ROWS,
            sections: sectionMeta,
          },
        },
        include: { _count: { select: { seats: true } } },
      });
    });
  }

  async getForEvent(eventId: string, holderKey: string | null) {
    const seatMap = await this.prisma.seatMap.findUnique({
      where: { eventId },
      include: {
        seats: {
          orderBy: [{ y: 'asc' }, { x: 'asc' }],
          select: {
            id: true,
            section: true,
            rowLabel: true,
            number: true,
            x: true,
            y: true,
            ticketTypeId: true,
          },
        },
        event: {
          select: {
            ticketTypes: {
              where: { kind: 'seated' },
              select: {
                id: true,
                name: true,
                priceSatang: true,
                remaining: true,
              },
            },
          },
        },
      },
    });
    if (!seatMap) {
      throw new NotFoundException('This event has no seat map');
    }

    const now = new Date();
    const [holds, soldTickets] = await Promise.all([
      this.prisma.hold.findMany({
        where: { eventId, expiresAt: { gt: now } },
        select: { seatId: true, holderKey: true, expiresAt: true },
      }),
      this.prisma.ticket.findMany({
        where: { eventId, seatId: { not: null }, status: { not: 'void' } },
        select: { seatId: true },
      }),
    ]);
    const holdBySeat = new Map(holds.map((hold) => [hold.seatId, hold]));
    const soldSeatIds = new Set(soldTickets.map((ticket) => ticket.seatId));

    return {
      id: seatMap.id,
      template: seatMap.template,
      meta: seatMap.meta,
      tiers: seatMap.event.ticketTypes,
      seats: seatMap.seats.map((seat) => {
        const hold = holdBySeat.get(seat.id);
        const sold = soldSeatIds.has(seat.id);
        const mine =
          hold !== undefined &&
          holderKey !== null &&
          hold.holderKey === holderKey;
        return {
          ...seat,
          status: sold ? 'sold' : hold ? 'held' : 'available',
          mine,
          expiresAt: mine ? hold.expiresAt : undefined,
        };
      }),
    };
  }
}
