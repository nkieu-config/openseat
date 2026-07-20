import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSeatMapDto } from './seatmaps.controller';

const ROW_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SECTION_GAP_ROWS = 1;

@Injectable()
export class SeatmapsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  async create(eventId: string, actingUserId: string, dto: CreateSeatMapDto) {
    await this.access.requireEventRole(eventId, actingUserId, 'manager');
    const existingSeatMap = await this.prisma.seatMap.findUnique({
      where: { eventId },
      select: { id: true },
    });
    if (existingSeatMap) {
      throw new ConflictException('This event already has a seat map');
    }
    const tierNames = dto.sections.map((section) => section.tierName.trim());
    if (new Set(tierNames).size !== tierNames.length) {
      throw new BadRequestException('Each section needs a distinct tier name');
    }
    const sectionNames = dto.sections.map((section) => section.name.trim());
    if (new Set(sectionNames).size !== sectionNames.length) {
      throw new BadRequestException('Each section needs a distinct name');
    }

    const positioned = dto.sections.some(
      (section) => section.x !== undefined && section.y !== undefined,
    );
    const autoMaxCols = Math.max(
      ...dto.sections.map((section) => section.cols),
    );

    return this.prisma.$transaction(async (tx) => {
      let yCursor = 0;
      let maxCols = 0;
      let maxRow = 0;
      const sectionMeta: {
        name: string;
        yStart: number;
        rows: number;
        cols: number;
        xOffset: number;
      }[] = [];

      const seatMap = await tx.seatMap.create({
        data: {
          eventId,
          template: positioned ? 'custom' : 'theater',
          meta: {},
        },
      });

      for (const section of dto.sections) {
        const x = section.x ?? Math.floor((autoMaxCols - section.cols) / 2);
        const y = section.y ?? yCursor;
        const ticketType = await tx.ticketType.create({
          data: {
            eventId,
            kind: 'seated',
            name: section.tierName.trim(),
            priceSatang: section.priceSatang,
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
              x: x + colIndex,
              y: y + rowIndex,
            })),
          ).flat(),
        });
        sectionMeta.push({
          name: section.name.trim(),
          yStart: y,
          rows: section.rows,
          cols: section.cols,
          xOffset: x,
        });
        maxCols = Math.max(maxCols, x + section.cols);
        maxRow = Math.max(maxRow, y + section.rows);
        if (section.y === undefined) {
          yCursor = y + section.rows + SECTION_GAP_ROWS;
        }
      }

      return tx.seatMap.update({
        where: { id: seatMap.id },
        data: {
          meta: { maxCols, totalRows: maxRow, sections: sectionMeta },
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
