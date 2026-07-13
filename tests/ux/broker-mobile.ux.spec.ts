import { expect, test } from '@playwright/test';

import { installBrokerScenario } from './fixtures/broker-scenario';
import { runBrokerJourney } from './support/benchmark';

test.beforeEach(async ({ page }) => {
  await installBrokerScenario(page);
});

test('mobile broker moves from Today to a captured email', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Mobile follow-up check',
    persona: 'Patrick between meetings using one hand on a phone-sized screen',
    targetSeconds: 12,
    targetActions: 2,
  }, async (journey) => {
    await page.goto('/app/desk');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText('Touches / 28 days')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

    await journey.action('Open Activity from the bottom navigation', () => page.locator('nav[aria-label="Mobile navigation"]').getByRole('link', { name: 'Activity' }).click());
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
    await journey.action('Search for the live property email', () => page.getByPlaceholder('Search emails, prospects, addresses').fill('10735'));
    await expect(page.getByText('Re: 10735 214 St - next steps')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});
