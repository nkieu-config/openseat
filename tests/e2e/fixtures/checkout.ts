import type { Locator, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

export function formWithButton(page: Page, buttonName: string): Locator {
  return page.locator('form').filter({ has: page.getByRole('button', { name: buttonName }) });
}

export async function submitAsGuest(page: Page, buttonName: string): Promise<void> {
  const form = formWithButton(page, buttonName);
  await form.getByLabel('Your name').fill('E2E Guest');
  await form.getByLabel('Email for your tickets').fill(`e2e-${randomUUID()}@openseat.test`);
  await form.getByRole('button', { name: buttonName }).click();
}
