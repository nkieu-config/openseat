import { Injectable, OnModuleDestroy } from '@nestjs/common';
import type { Server } from 'socket.io';

export type SeatChange = {
  held?: string[];
  released?: string[];
  sold?: string[];
};

type SeatBatch = {
  held: Set<string>;
  released: Set<string>;
  sold: Set<string>;
};

const FLUSH_INTERVAL_MS = 250;

@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private server: Server | null = null;
  private readonly pending = new Map<string, SeatBatch>();
  private flushTimer: NodeJS.Timeout | null = null;

  attachServer(server: Server) {
    this.server = server;
  }

  seatsChanged(eventId: string, change: SeatChange) {
    const batch = this.pending.get(eventId) ?? {
      held: new Set<string>(),
      released: new Set<string>(),
      sold: new Set<string>(),
    };
    for (const seatId of change.held ?? []) {
      batch.held.add(seatId);
      batch.released.delete(seatId);
      batch.sold.delete(seatId);
    }
    for (const seatId of change.released ?? []) {
      batch.released.add(seatId);
      batch.held.delete(seatId);
      batch.sold.delete(seatId);
    }
    for (const seatId of change.sold ?? []) {
      batch.sold.add(seatId);
      batch.held.delete(seatId);
      batch.released.delete(seatId);
    }
    this.pending.set(eventId, batch);
    this.flushTimer ??= setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  private flush() {
    if (this.pending.size === 0) {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
      return;
    }
    if (!this.server) {
      return;
    }
    for (const [eventId, batch] of this.pending) {
      this.server.to(`event:${eventId}`).emit('seats', {
        held: [...batch.held],
        released: [...batch.released],
        sold: [...batch.sold],
      });
    }
    this.pending.clear();
  }

  orderChanged(orderId: string, payload: { status: string }) {
    this.server?.to(`order:${orderId}`).emit('order', payload);
  }

  onModuleDestroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}
