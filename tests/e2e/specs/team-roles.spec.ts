import { getEvent } from '../fixtures/api';
import { demoContext, expect, test } from '../fixtures/auth';

test('an owner staffs the event and the staff chair sees only the door', async ({
  browser,
  request,
}) => {
  const event = await getEvent(request, 'bangkok-indie-fest');
  const crewEmail = `door-crew-${Date.now()}@example.com`;

  const owner = await demoContext(browser, 'organizer');
  const ownerPage = await owner.newPage();
  await ownerPage.goto(`/organizer/events/${event.id}`);

  await expect(ownerPage.getByRole('heading', { name: 'Team' })).toBeVisible();
  await ownerPage.getByLabel('Add by email').fill(crewEmail);
  await ownerPage.getByRole('button', { name: 'Add' }).click();

  const newRow = ownerPage.getByRole('listitem').filter({ hasText: crewEmail });
  await expect(newRow).toContainText('pending');

  const staff = await demoContext(browser, 'staff');
  const staffPage = await staff.newPage();
  await staffPage.goto('/organizer');

  await expect(staffPage.getByRole('heading', { name: 'Bangkok Indie Fest 2026' })).toBeVisible();
  await expect(staffPage.getByText('staff', { exact: true })).toBeVisible();

  await staffPage.getByRole('button', { name: 'Console' }).click();
  await staffPage.waitForURL(/\/organizer\/events\/[^/]+\/checkin/);

  await expect(staffPage.getByRole('button', { name: 'Check in' })).toBeVisible();
  await expect(staffPage.getByText('Bangkok Indie Fest 2026')).toBeVisible();
  await expect(staffPage.locator('main')).not.toContainText('฿');

  await staffPage.goto(`/organizer/events/${event.id}/orders`);
  await expect(staffPage.getByText('Your role does not allow this view')).toBeVisible();

  await owner.close();
  await staff.close();
});
