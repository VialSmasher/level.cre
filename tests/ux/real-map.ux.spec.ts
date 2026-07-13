import { expect, test } from '@playwright/test';

import { runBrokerJourney } from './support/benchmark';

test('real Google map supports Edmonton search and aerial mode', async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem('demo-mode', 'true');
  });

  const metrics = await runBrokerJourney(page, testInfo, {
    journey: 'Real Edmonton map search',
    persona: 'Patrick preparing for a market conversation from the live map',
    targetSeconds: 20,
    targetActions: 3,
    skipAccessibility: true,
  }, async (journey) => {
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    const search = page.getByRole('combobox', { name: 'Search' });
    await expect(search).toBeEnabled();
    await expect(page.locator('.gm-style')).toBeVisible();
    await expect(page.getByText("This page can't load Google Maps correctly.")).toHaveCount(0);

    await journey.action('Search for an unsaved Edmonton address', () => search.fill('10060 Jasper Avenue'));
    await expect(page.getByText('Google Places near Edmonton')).toBeVisible();
    await journey.action('Choose the first Google Places result', () => page.getByRole('option').first().click());
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await journey.action('Switch to aerial imagery', () => page.getByRole('button', { name: 'Show aerial map' }).click());
    await expect(page.getByRole('button', { name: 'Show road map' })).toBeVisible();
  });

  expect(metrics.consoleErrors).toEqual([]);
});
