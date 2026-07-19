import type { Server } from 'socket.io';
import { RealtimeService } from './realtime.service';

type EmittedSeats = { held: string[]; released: string[]; sold: string[] };

function attachRecorder(service: RealtimeService) {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  service.attachServer({ to } as unknown as Server);
  return {
    emit,
    lastPayload(): EmittedSeats | undefined {
      const calls = emit.mock.calls as [string, EmittedSeats][];
      return calls.at(-1)?.[1];
    },
  };
}

describe('RealtimeService seat batching', () => {
  let service: RealtimeService;

  beforeEach(() => {
    jest.useFakeTimers();
    service = new RealtimeService();
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('releases a seat that sold earlier in the same batch', () => {
    const recorder = attachRecorder(service);

    service.seatsChanged('event-1', { sold: ['seat-1'] });
    service.seatsChanged('event-1', { released: ['seat-1'] });
    jest.advanceTimersByTime(250);

    expect(recorder.lastPayload()).toEqual({
      held: [],
      released: ['seat-1'],
      sold: [],
    });
  });

  it('sells a seat that was released earlier in the same batch', () => {
    const recorder = attachRecorder(service);

    service.seatsChanged('event-1', { released: ['seat-1'] });
    service.seatsChanged('event-1', { sold: ['seat-1'] });
    jest.advanceTimersByTime(250);

    expect(recorder.lastPayload()).toEqual({
      held: [],
      released: [],
      sold: ['seat-1'],
    });
  });

  it('holds a seat that sold earlier in the same batch', () => {
    const recorder = attachRecorder(service);

    service.seatsChanged('event-1', { sold: ['seat-1'] });
    service.seatsChanged('event-1', { held: ['seat-1'] });
    jest.advanceTimersByTime(250);

    expect(recorder.lastPayload()).toEqual({
      held: ['seat-1'],
      released: [],
      sold: [],
    });
  });

  it('keeps unrelated seats in their own buckets', () => {
    const recorder = attachRecorder(service);

    service.seatsChanged('event-1', { held: ['seat-1'] });
    service.seatsChanged('event-1', { sold: ['seat-2'] });
    service.seatsChanged('event-1', { released: ['seat-3'] });
    jest.advanceTimersByTime(250);

    expect(recorder.lastPayload()).toEqual({
      held: ['seat-1'],
      released: ['seat-3'],
      sold: ['seat-2'],
    });
  });
});
