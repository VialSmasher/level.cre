import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';

export type JourneyMetrics = {
  journey: string;
  persona: string;
  project: string;
  completed: boolean;
  score: number;
  elapsedMs: number;
  targetSeconds: number;
  actionCount: number;
  targetActions: number;
  steps: string[];
  consoleErrors: string[];
  accessibility: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
    violations: Array<{ id: string; impact: string | null; nodes: number; targets: string[] }>;
  };
};

type JourneyDefinition = {
  journey: string;
  persona: string;
  targetSeconds: number;
  targetActions: number;
  skipAccessibility?: boolean;
};

type JourneyController = {
  action<T>(label: string, operation: () => Promise<T>): Promise<T>;
  note(label: string): void;
};

const round = (value: number) => Math.round(value * 10) / 10;

function calculateScore(metrics: Omit<JourneyMetrics, 'score'>) {
  if (!metrics.completed) return 0;

  const elapsedSeconds = Math.max(0.1, metrics.elapsedMs / 1000);
  const completionScore = 40;
  const speedScore = 20 * Math.min(1, metrics.targetSeconds / elapsedSeconds);
  const actionScore = metrics.actionCount <= metrics.targetActions
    ? 15
    : 15 * (metrics.targetActions / Math.max(1, metrics.actionCount));
  const reliabilityScore = Math.max(0, 10 - (metrics.consoleErrors.length * 2));
  const affectedNodes = metrics.accessibility.violations.reduce((sum, item) => sum + item.nodes, 0);
  const accessibilityScore = Math.max(
    0,
    15
      - (metrics.accessibility.critical * 8)
      - (metrics.accessibility.serious * 3)
      - metrics.accessibility.moderate
      - Math.min(6, affectedNodes * 0.25),
  );

  return round(completionScore + speedScore + actionScore + reliabilityScore + accessibilityScore);
}

export async function runBrokerJourney(
  page: Page,
  testInfo: TestInfo,
  definition: JourneyDefinition,
  exercise: (journey: JourneyController) => Promise<void>,
) {
  const startedAt = Date.now();
  const steps: string[] = [];
  const consoleErrors: string[] = [];
  let actionCount = 0;
  let completed = false;
  let thrown: unknown;

  const onConsole = (message: { type(): string; text(): string }) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  };
  const onPageError = (error: Error) => consoleErrors.push(error.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const journey: JourneyController = {
    async action(label, operation) {
      actionCount += 1;
      steps.push(label);
      return operation();
    },
    note(label) {
      steps.push(label);
    },
  };

  try {
    await exercise(journey);
    completed = true;
  } catch (error) {
    thrown = error;
  }

  const elapsedMs = Date.now() - startedAt;
  const violations = definition.skipAccessibility || page.isClosed()
    ? []
    : await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()
      .then((result) => result.violations)
      .catch((error) => {
        consoleErrors.push(`Accessibility scan failed: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      });

  const accessibility = {
    critical: violations.filter((item) => item.impact === 'critical').length,
    serious: violations.filter((item) => item.impact === 'serious').length,
    moderate: violations.filter((item) => item.impact === 'moderate').length,
    minor: violations.filter((item) => item.impact === 'minor').length,
    violations: violations.map((item) => ({
      id: item.id,
      impact: item.impact,
      nodes: item.nodes.length,
      targets: item.nodes.flatMap((node) => node.target.map(String)).slice(0, 12),
    })),
  };

  const scorelessMetrics = {
    journey: definition.journey,
    persona: definition.persona,
    project: testInfo.project.name,
    completed,
    elapsedMs,
    targetSeconds: definition.targetSeconds,
    actionCount,
    targetActions: definition.targetActions,
    steps,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 20),
    accessibility,
  };
  const metrics: JourneyMetrics = {
    ...scorelessMetrics,
    score: calculateScore(scorelessMetrics),
  };

  if (!page.isClosed()) {
    const screenshot = await page.screenshot({ fullPage: false }).catch(() => null);
    if (screenshot) {
      await testInfo.attach('journey-final-state', { body: screenshot, contentType: 'image/png' });
    }
  }
  await testInfo.attach('ux-metrics', {
    body: Buffer.from(JSON.stringify(metrics, null, 2)),
    contentType: 'application/json',
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);

  if (thrown) throw thrown;
  return metrics;
}
