import { expect, test } from '@playwright/test';

test('the seeded event page renders', async ({ page }) => {
  await page.goto('/events/bangkok-indie-fest');
  await expect(page.getByRole('heading', { name: /Bangkok Indie Fest/i })).toBeVisible();
});
