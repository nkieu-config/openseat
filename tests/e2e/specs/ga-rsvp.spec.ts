import { expect, test } from '../fixtures/auth';
import { submitAsGuest } from '../fixtures/checkout';

test('a guest claims a free general-admission ticket without an account', async ({ page }) => {
  await page.goto('/events/bangkok-indie-fest');

  await page.getByRole('button', { name: 'Add one General admission' }).click();
  await submitAsGuest(page, 'Claim 1 ticket');

  await page.waitForURL(/\/orders\//);
  await expect(page.getByText('paid', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: /You're going to/ })).toBeVisible();
  await expect(page.getByText(/General admission · #1/)).toBeVisible();
});
