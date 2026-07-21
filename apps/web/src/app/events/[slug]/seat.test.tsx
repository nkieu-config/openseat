// @vitest-environment jsdom

import type { SeatInfo } from '@openseat/contracts';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Seat } from './seat';

function seatOf(overrides: Partial<SeatInfo> = {}): SeatInfo {
  return {
    id: 'seat-1',
    section: 'Stalls',
    rowLabel: 'A',
    number: 4,
    x: 3,
    y: 0,
    status: 'available',
    mine: false,
    ...overrides,
  } as SeatInfo;
}

function renderSeat(seat: SeatInfo, onToggle = vi.fn()) {
  render(
    <svg>
      <Seat seat={seat} x={0} y={0} onToggle={onToggle} />
    </svg>,
  );
  return onToggle;
}

afterEach(cleanup);

describe('Seat', () => {
  it('says who it is and what state it is in, out loud', () => {
    renderSeat(seatOf());

    expect(screen.getByRole('button', { name: 'Stalls A4 — available' })).toBeTruthy();
  });

  it('calls a seat you already hold yours, not held', () => {
    renderSeat(seatOf({ status: 'held', mine: true }));

    expect(screen.getByRole('button', { name: 'Stalls A4 — yours' })).toBeTruthy();
  });

  it('keeps a free seat in the tab order and a sold one out of it', () => {
    renderSeat(seatOf());
    expect(screen.getByRole('button').getAttribute('tabindex')).toBe('0');

    cleanup();
    renderSeat(seatOf({ status: 'sold' }));
    expect(screen.getByRole('button', { name: 'Stalls A4 — sold' }).getAttribute('tabindex')).toBe(
      '-1',
    );
  });

  it('takes Enter and Space, the way a real button does', async () => {
    const onToggle = renderSeat(seatOf());
    const seat = screen.getByRole('button');
    seat.focus();

    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('ignores keys that mean nothing here', async () => {
    const onToggle = renderSeat(seatOf());
    screen.getByRole('button').focus();

    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard('x');

    expect(onToggle).not.toHaveBeenCalled();
  });

  it('answers a pointer as well as a keyboard', async () => {
    const onToggle = renderSeat(seatOf());

    await userEvent.click(screen.getByRole('button'));

    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ id: 'seat-1' }));
  });

  it('labels the first seat of a row so the row reads as a row', () => {
    const { container } = render(
      <svg>
        <Seat seat={seatOf({ number: 1 })} x={40} y={0} onToggle={vi.fn()} />
      </svg>,
    );

    expect(container.querySelector('text')?.textContent).toBe('A');
  });
});
