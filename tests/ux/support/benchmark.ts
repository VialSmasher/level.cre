import AxeBuilder from '@axe-core/playwright';
import type { ConsoleMessage, Page, TestInfo } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type JourneyTrustCheck = {
  label: string;
  passed: boolean;
  detail?: string;
};

export type JourneyMetrics = {
  journey: string;
  persona: string;
  project: string;
  completed: boolean;
  score: number;
  trustScore: number;
  readinessScore: number;
  elapsedMs: number;
  targetSeconds: number;
  actionCount: number;
  targetActions: number;
  steps: string[];
  consoleErrors: string[];
  trustChecks: JourneyTrustCheck[];
  screenshots: string[];
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
  trust(label: string, passed: boolean, detail?: string): void;
  capture(label: string): Promise<void>;
};

const round = (value: number) => Math.round(value * 10) / 10;
const slugify = (value: string) => value
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64);

function calculateScore(metrics: Omit<JourneyMetrics, 'score' | 'trustScore' | 'readinessScore'>) {
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
  const trustChecks: JourneyTrustCheck[] = [];
  const screenshots: string[] = [];
  let actionCount = 0;
  let screenshotCount = 0;
  let completed = false;
  let thrown: unknown;

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() !== 'error') return;
    const location = message.location();
    consoleErrors.push(location.url ? `${message.text()} [${location.url}]` : message.text());
  };
  const onPageError = (error: Error) => consoleErrors.push(error.stack || error.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const capture = async (label: string) => {
    if (page.isClosed()) return;
    screenshotCount += 1;
    const directory = path.resolve(process.cwd(), 'artifacts', 'ux-benchmark', 'screenshots', testInfo.project.name);
    mkdirSync(directory, { recursive: true });
    const fileName = `${slugify(definition.journey)}-${String(screenshotCount).padStart(2, '0')}-${slugify(label)}.png`;
    const screenshotPath = path.join(directory, fileName);
    await page.screenshot({ path: screenshotPath, fullPage: false });
    const relativePath = path.relative(process.cwd(), screenshotPath).replaceAll('\\', '/');
    screenshots.push(relativePath);
    await testInfo.attach(`journey-${slugify(label)}`, { path: screenshotPath, contentType: 'image/png' });
  };

  const journey: JourneyController = {
    async action(label, operation) {
      actionCount += 1;
      steps.push(label);
      return operation();
    },
    note(label) {
      steps.push(label);
    },
    trust(label, passed, detail) {
      trustChecks.push({ label, passed, detail });
    },
    capture,
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
    trustChecks,
    screenshots,
    accessibility,
  };
  const score = calculateScore(scorelessMetrics);
  const trustScore = trustChecks.length
    ? round((trustChecks.filter((item) => item.passed).length / trustChecks.length) * 100)
    : 100;
  const metrics: JourneyMetrics = {
    ...scorelessMetrics,
    score,
    trustScore,
    readinessScore: round((score * 0.65) + (trustScore * 0.35)),
  };

  if (!page.isClosed()) {
    await capture(screenshotCount > 0 ? 'final' : 'final-state').catch(() => null);
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
