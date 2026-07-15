import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { RealtimeService } from './realtime.service';

function roomFor(eventId: unknown): string | null {
  if (
    typeof eventId !== 'string' ||
    eventId.length === 0 ||
    eventId.length > 64
  ) {
    return null;
  }
  return `event:${eventId}`;
}

@WebSocketGateway({ namespace: '/rt', cors: { origin: true } })
export class RealtimeGateway implements OnGatewayInit {
  constructor(private readonly realtime: RealtimeService) {}

  afterInit(server: Server) {
    this.realtime.attachServer(server);
  }

  @SubscribeMessage('join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string },
  ) {
    const room = roomFor(body?.eventId);
    if (!room) {
      return { joined: false };
    }
    await client.join(room);
    return { joined: true };
  }

  @SubscribeMessage('leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { eventId?: string },
  ) {
    const room = roomFor(body?.eventId);
    if (room) {
      await client.leave(room);
    }
    return { left: room !== null };
  }
}
