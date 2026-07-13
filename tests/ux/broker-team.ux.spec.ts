import { expect, test } from '@playwright/test';

import { installBrokerScenario } from './fixtures/broker-scenario';
import { runBrokerJourney } from './support/benchmark';

test.beforeEach(async ({ page }) => {
  await installBrokerScenario(page);
});

test('team lead can identify shared pursuit ownership and responsibility', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Mentor a shared pursuit',
    persona: 'A team lead checking a junior broker pursuit without taking over the deal',
    targetSeconds: 10,
    targetActions: 1,
  }, async (journey) => {
    await page.goto('/app/desk');
    await journey.action('Open Pursuits', () => page.locator('aside').getByRole('link', { name: 'Pursuits' }).click());
    await expect(page.getByRole('heading', { name: 'Shared with me' })).toBeVisible();
    await expect(page.getByText('16520 111 Ave', { exact: true })).toBeVisible();
    await journey.capture('shared-pursuit-overview');

    journey.trust(
      'Owned and shared pursuits are clearly separated',
      await page.getByRole('heading', { name: 'My pursuits' }).count() === 1
        && await page.getByRole('heading', { name: 'Shared with me' }).count() === 1,
    );
    journey.trust(
      'The pursuit owner is explicit and structured',
      await page.getByText('Owner: Jack Norris', { exact: true }).count() === 1,
      'A mentor should not have to infer ownership from the pursuit title.',
    );
    journey.trust(
      'The current permission level is visible',
      await page.getByText('viewer access', { exact: true }).count() === 1,
      'The broker should know whether they can edit before opening the pursuit.',
    );
  });
});

test('assistant can isolate uncertain activity without creating a false CRM fact', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Triage uncertain email activity',
    persona: 'An assistant clearing the review queue while protecting CRM data quality',
    targetSeconds: 12,
    targetActions: 3,
  }, async (journey) => {
    await page.goto('/app/desk');
    await journey.action('Open Activity', () => page.locator('aside').getByRole('link', { name: 'Activity' }).click());
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible();

    await journey.action('Open the activity status filter', () => page.getByRole('combobox', { name: 'Filter activity by status' }).click());
    await journey.action('Show only Needs Context', () => page.getByRole('option', { name: 'Needs Context' }).click());
    await expect(page.getByText('Edmonton industrial requirement')).toBeVisible();
    await expect(page.getByText('Re: 10735 214 St - next steps')).toBeHidden();
    const logButton = page.getByRole('button', { name: 'Log' });
    await expect(logButton).toBeDisabled();
    await journey.capture('needs-context-review');

    journey.trust(
      'Uncertain activity is clearly labeled Needs Context',
      await page.getByText('Needs Context', { exact: true }).count() > 0,
    );
    journey.trust('An unattached email cannot be logged as confirmed activity', await logButton.isDisabled());
    journey.trust(
      'The workflow asks for an existing company or prospect instead of inventing a map pin',
      await page.getByRole('combobox', { name: 'Attach activity to company or prospect' }).count() === 1,
    );
  });
});

test('junior broker can start a listing farm but receives enough setup guidance', async ({ page }, testInfo) => {
  await runBrokerJourney(page, testInfo, {
    journey: 'Start a first listing farm',
    persona: 'A junior broker creating a prospecting pursuit for a new listing assignment',
    targetSeconds: 15,
    targetActions: 4,
  }, async (journey) => {
    await page.goto('/app/workspaces');
    await expect(page.getByRole('heading', { name: 'Pursuits', exact: true })).toBeVisible();
    journey.trust(
      'The page explains the valid pursuit use cases',
      await page.getByText('Farm a listing, territory, owner target, or client requirement with a shared market view.').count() === 1,
    );

    await journey.action('Start a new pursuit', () => page.getByRole('button', { name: 'Create pursuit' }).click());
    await expect(page.getByRole('heading', { name: 'Create Pursuit' })).toBeVisible();
    await journey.capture('new-pursuit-setup');

    const setupInputs = page.getByRole('dialog').getByRole('textbox');
    journey.trust(
      'Setup captures a market anchor or property address',
      await setupInputs.count() > 1,
      'A name-only pursuit opens a blank workspace and leaves a junior broker to reconstruct the context.',
    );

    await journey.action('Name the listing farm', () => page.getByPlaceholder('e.g., NW Distributors').fill('149 Street Owner Farm'));
    await journey.action('Anchor it to the market', () => page.getByPlaceholder('e.g., 14840 134 Ave or Northwest Edmonton').fill('149 Street, Edmonton'));
    await journey.action('Create the pursuit', () => page.getByRole('button', { name: 'Create Pursuit' }).click());
    await expect(page).toHaveURL(/\/app\/workspaces\//);
    journey.trust('The broker stays inside the pursuit workflow after creation', /\/app\/workspaces\//.test(page.url()));
  });
});
