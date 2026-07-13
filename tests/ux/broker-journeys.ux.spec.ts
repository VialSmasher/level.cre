import { expect, test } from '@playwright/test';

import { installBrokerScenario } from './fixtures/broker-scenario';
import { runBrokerJourney } from './support/benchmark';

test.beforeEach(async ({ page }) => {
  await installBrokerScenario(page);
});

test('morning desk identifies the next deal and waiting work', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Morning revenue check',
    persona: 'Patrick starting the day and deciding what to advance first',
    targetSeconds: 8,
    targetActions: 1,
  }, async (journey) => {
    await page.goto('/app/desk');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
    await expect(page.getByText('Best next move')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Advance 10735 214 St' }).first()).toBeVisible();
    journey.note('Recognize 10735 214 St as the best next move');

    await journey.action('Open the Waiting queue', () => page.getByRole('button', { name: /Waiting/ }).click());
    await expect(page.getByRole('heading', { name: 'Confirm access at 2959 Parsons' })).toBeVisible();
  });
});

test('broker creates a focused pursuit without leaving the workflow', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Create a listing pursuit',
    persona: 'Patrick setting up a prospecting farm around an active listing',
    targetSeconds: 12,
    targetActions: 4,
  }, async (journey) => {
    await page.goto('/app/desk');
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

    await journey.action('Open Pursuits', () => page.locator('aside').getByRole('link', { name: 'Pursuits' }).click());
    await expect(page.getByRole('heading', { name: 'Pursuits', exact: true })).toBeVisible();
    await expect(page.getByText('14840 134 Ave Listing Farm')).toBeVisible();

    await journey.action('Start a new pursuit', () => page.getByRole('button', { name: 'Create pursuit' }).click());
    await journey.action('Name the pursuit', () => page.getByPlaceholder('e.g., NW Distributors').fill('West Edmonton Owner Hunt'));
    await journey.action('Create the pursuit', () => page.getByRole('button', { name: 'Create Pursuit' }).click());
    await expect(page).toHaveURL(/\/app\/workspaces\//);
  });
});

test('activity ledger finds the email tied to a live property', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Find captured deal activity',
    persona: 'Patrick checking whether a deal email reached the business development ledger',
    targetSeconds: 10,
    targetActions: 2,
  }, async (journey) => {
    await page.goto('/app/desk');
    await journey.action('Open Activity', () => page.locator('aside').getByRole('link', { name: 'Activity' }).click());
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();
    await expect(page.getByText('BCC capture ready')).toBeVisible();

    await journey.action('Search for 10735 214 St', () => page.getByPlaceholder('Search emails, prospects, addresses').fill('10735 214 St'));
    await expect(page.getByText('Re: 10735 214 St - next steps')).toBeVisible();
    await expect(page.getByText('West End Distribution').last()).toBeVisible();
  });
});

test('scorecard explains current production momentum', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Read the production scorecard',
    persona: 'Patrick checking activity momentum and the shortest path to a stronger week',
    targetSeconds: 8,
    targetActions: 1,
  }, async (journey) => {
    await page.goto('/app/desk');
    await journey.action('Open Scorecard', () => page.locator('aside').getByRole('link', { name: 'Scorecard' }).click());
    await expect(page.getByRole('heading', { name: 'Scorecard', exact: true })).toBeVisible();
    await expect(page.getByText('137')).toBeVisible();
    await expect(page.getByText('1 to 5-day rhythm')).toBeVisible();
    await expect(page.getByText('Next best actions')).toBeVisible();
  });
});
