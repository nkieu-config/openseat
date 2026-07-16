import { test as base, expect, type Browser, type BrowserContext } from '@playwright/test';
import { WEB } from './api';

export type DemoRole = 'buyer' | 'organizer';

const ENGLISH_LOCALE = { name: 'os_locale', value: 'en', url: WEB };

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addCookies([ENGLISH_LOCALE]);
    await use(context);
  },
});

export { expect };

export async function demoContext(browser: Browser, role: DemoRole): Promise<BrowserContext> {
  const context = await browser.newContext();
  await context.addCookies([ENGLISH_LOCALE]);
  const response = await context.request.post(`${WEB}/api/demo/login`, { data: { role } });
  if (!response.ok()) {
    throw new Error(`demo login (${role}) failed: ${response.status()} ${await response.text()}`);
  }
  return context;
}
