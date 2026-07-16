import { expect, test } from '../fixtures/auth';
import { expectSeatStatus, firstAvailableSeat, seat } from '../fixtures/seats';

test('a buyer picks a seat, pays, and gets a ticket', async ({ page }) => {
  await page.goto('/events/bangkok-indie-fest');

  const label = await firstAvailableSeat(page, 'Front');
  await seat(page, label).click();
  await expectSeatStatus(page, label, 'yours');

  const form = page
    .locator('form')
    .filter({ has: page.getByRole('button', { name: 'Claim 1 seat' }) });
  await form.getByLabel('Your name').fill('E2E Buyer');
  await form.getByLabel('Email for your tickets').fill(`e2e-${Date.now()}@openseat.test`);
  await page.getByRole('button', { name: 'Claim 1 seat' }).click();

  await page.waitForURL(/localhost:4100\/pay\//);
  await page.getByRole('button', { name: /^Pay / }).click();

  await page.waitForURL(/\/orders\//);
  await expect(page.getByText('paid', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.goto('/events/bangkok-indie-fest');
  await expectSeatStatus(page, label, 'sold');
});
