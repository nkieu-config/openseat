import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AccessService } from '../access/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CheckinService } from './checkin.service';

describe('CheckinService', () => {
  let service: CheckinService;
  const prisma = {
    ticket: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const access = { requireEventRole: jest.fn() };

  const baseTicket = {
    id: 'ticket-1',
    eventId: 'event-1',
    status: 'issued',
    attendeeName: 'Ada',
    checkedInAt: null as Date | null,
    ticketType: { name: 'Standard' },
    seat: { section: 'Stalls', rowLabel: 'A', number: 4 },
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    access.requireEventRole.mockResolvedValue({ role: 'staff' });
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckinService,
        { provide: PrismaService, useValue: prisma },
        { provide: AccessService, useValue: access },
      ],
    }).compile();
    service = moduleRef.get(CheckinService);
  });

  function scan() {
    return service.checkIn('event-1', 'staff-1', 'qr-1');
  }

  it('admits a ticket that was still issued when the update landed', async () => {
    prisma.ticket.findUnique.mockResolvedValue(baseTicket);
    prisma.ticket.updateMany.mockResolvedValue({ count: 1 });
    prisma.ticket.findUniqueOrThrow.mockResolvedValue({
      ...baseTicket,
      status: 'checked_in',
      checkedInAt: new Date(),
    });

    await expect(scan()).resolves.toMatchObject({
      outcome: 'checked_in',
      status: 'checked_in',
    });
  });

  it('reports a rescan of an admitted ticket as already checked in', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...baseTicket,
      status: 'checked_in',
    });
    prisma.ticket.updateMany.mockResolvedValue({ count: 0 });
    prisma.ticket.findUniqueOrThrow.mockResolvedValue({
      ...baseTicket,
      status: 'checked_in',
      checkedInAt: new Date(),
    });

    await expect(scan()).resolves.toMatchObject({
      outcome: 'already_checked_in',
      status: 'checked_in',
    });
  });

  it('rejects a ticket that was already void when it was read', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...baseTicket,
      status: 'void',
    });

    await expect(scan()).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ticket.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a ticket a refund voided between the read and the update', async () => {
    prisma.ticket.findUnique.mockResolvedValue(baseTicket);
    prisma.ticket.updateMany.mockResolvedValue({ count: 0 });
    prisma.ticket.findUniqueOrThrow.mockResolvedValue({
      ...baseTicket,
      status: 'void',
    });

    await expect(scan()).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses a ticket that belongs to another event', async () => {
    prisma.ticket.findUnique.mockResolvedValue({
      ...baseTicket,
      eventId: 'event-2',
    });

    await expect(scan()).rejects.toBeInstanceOf(NotFoundException);
  });
});
