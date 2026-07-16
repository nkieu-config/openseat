import { expect, type Locator, type Page } from '@playwright/test';

export type SeatStatus = 'available' | 'held' | 'sold' | 'yours';

const SEPARATOR = ' — ';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function seat(page: Page, label: string): Locator {
  return page.getByRole('button', {
    name: new RegExp(`^${escapeRegExp(label + SEPARATOR)}`),
  });
}

export async function expectSeatStatus(
  page: Page,
  label: string,
  status: SeatStatus,
): Promise<void> {
  await expect(seat(page, label)).toHaveAccessibleName(
    new RegExp(`^${escapeRegExp(label + SEPARATOR + status)}$`),
  );
}

export async function firstAvailableSeat(page: Page, section: string): Promise<string> {
  const available = page
    .getByRole('button', {
      name: new RegExp(`^${escapeRegExp(section)} \\w+\\d+${escapeRegExp(SEPARATOR)}available$`),
    })
    .first();
  await expect(available).toBeVisible();
  const name = await available.getAttribute('aria-label');
  const [label] = name?.split(SEPARATOR) ?? [];
  if (label === undefined) {
    throw new Error(`no available seat in section ${section}`);
  }
  return label;
}
