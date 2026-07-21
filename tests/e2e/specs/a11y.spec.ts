import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { getEvent } from '../fixtures/api';
import { demoContext, expect, test } from '../fixtures/auth';

const BLOCKING = ['serious', 'critical'];

async function blockingViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return violations
    .filter((violation) => BLOCKING.includes(violation.impact ?? ''))
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target.join(' ')),
    }));
}

test('the landing page carries no blocking accessibility violations', async ({ page }) => {
  await page.goto('/');

  expect(await blockingViolations(page)).toEqual([]);
});

test('the seat map carries no blocking accessibility violations', async ({ page }) => {
  await page.goto('/events/bangkok-indie-fest');
  await expect(page.getByRole('group', { name: 'Interactive seat map' })).toBeVisible();

  expect(await blockingViolations(page)).toEqual([]);
});

test('the waiting room carries no blocking accessibility violations', async ({ page }) => {
  await page.goto('/events/midnight-drop');

  expect(await blockingViolations(page)).toEqual([]);
});

test('the organizer console carries no blocking accessibility violations', async ({
  browser,
  request,
}) => {
  const event = await getEvent(request, 'bangkok-indie-fest');
  const organizer = await demoContext(browser, 'organizer');
  const page = await organizer.newPage();

  await page.goto(`/organizer/events/${event.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  expect(await blockingViolations(page)).toEqual([]);

  await organizer.close();
});
