import { expect, test } from '@playwright/test';

import { runBrokerJourney } from './support/benchmark';

const waitForMapTilesToCoverViewport = async (
  page: import('@playwright/test').Page,
  tileUrlMarker?: string,
) => {
  await expect.poll(async () => page.locator('.gm-style').evaluate((mapRoot, marker) => {
    const mapBounds = mapRoot.getBoundingClientRect();
    const tileBounds = Array.from(mapRoot.querySelectorAll('img'))
      .filter((image) => !marker || image.src.includes(marker))
      .filter((image) => image.complete && image.naturalWidth >= 200 && image.naturalHeight >= 200)
      .map((image) => image.getBoundingClientRect())
      .filter((bounds) => (
        bounds.width >= 200 &&
        bounds.height >= 200 &&
        bounds.right > mapBounds.left &&
        bounds.left < mapBounds.right &&
        bounds.bottom > mapBounds.top &&
        bounds.top < mapBounds.bottom
      ));

    if (tileBounds.length < (marker ? 15 : 6)) return 0;

    const coveredWidth = Math.min(mapBounds.right, Math.max(...tileBounds.map((bounds) => bounds.right)))
      - Math.max(mapBounds.left, Math.min(...tileBounds.map((bounds) => bounds.left)));
    const coveredHeight = Math.min(mapBounds.bottom, Math.max(...tileBounds.map((bounds) => bounds.bottom)))
      - Math.max(mapBounds.top, Math.min(...tileBounds.map((bounds) => bounds.top)));
    return Math.min(coveredWidth / mapBounds.width, coveredHeight / mapBounds.height);
  }, tileUrlMarker), {
    message: 'Google map tiles should cover the visible map before evidence is captured',
    timeout: 15_000,
  }).toBeGreaterThan(0.9);
};

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
    await waitForMapTilesToCoverViewport(page);

    await journey.action('Search for a partial Edmonton company name', () => search.fill('Nucor'));
    await expect(page.getByText('Google Places near Edmonton')).toBeVisible();
    await expect(page.getByRole('option').filter({ hasText: 'Nucor' })).not.toHaveCount(0);

    await journey.action('Search for an unsaved Edmonton address', () => search.fill('10060 Jasper Avenue'));
    await expect(page.getByText('Google Places near Edmonton')).toBeVisible();
    await journey.action('Choose the first Google Places result', () => page.getByRole('option').first().click());
    await expect(page.getByRole('listbox')).toHaveCount(0);

    await journey.action('Switch to aerial imagery', () => page.getByRole('button', { name: 'Show aerial map' }).click());
    await expect(page.getByRole('button', { name: 'Show road map' })).toBeVisible();
    await waitForMapTilesToCoverViewport(page, '!1e1!');
    await expect(page.getByRole('listbox')).toHaveCount(0);
  });

  expect(metrics.consoleErrors).toEqual([]);
});
