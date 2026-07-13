import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { FullResult, Reporter, TestCase, TestResult } from '@playwright/test/reporter';

import type { JourneyMetrics } from './benchmark';

type ReportRow = JourneyMetrics & {
  status: string;
  durationMs: number;
};

function parseMetrics(result: TestResult): JourneyMetrics | null {
  const attachment = result.attachments.find((item) => item.name === 'ux-metrics');
  if (!attachment) return null;

  try {
    const body = attachment.body || (attachment.path ? readFileSync(attachment.path) : null);
    return body ? JSON.parse(body.toString('utf8')) as JourneyMetrics : null;
  } catch {
    return null;
  }
}

function markdownFor(rows: ReportRow[], runStatus: string) {
  const averageMechanical = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.score, 0) / rows.length) * 10) / 10
    : 0;
  const averageTrust = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.trustScore, 0) / rows.length) * 10) / 10
    : 0;
  const averageReadiness = rows.length
    ? Math.round((rows.reduce((sum, row) => sum + row.readinessScore, 0) / rows.length) * 10) / 10
    : 0;
  const completed = rows.filter((row) => row.completed && row.status === 'passed').length;
  const generatedAt = new Date().toISOString();

  return [
    '# Level CRE UX Benchmark',
    '',
    `Generated: ${generatedAt}`,
    `Run status: ${runStatus}`,
    `Mechanical benchmark score: ${averageMechanical}/100`,
    `Trust score: ${averageTrust}/100`,
    `Team-readiness score: ${averageReadiness}/100`,
    `Completed journeys: ${completed}/${rows.length}`,
    '',
    '| Journey | Surface | Mechanical | Trust | Readiness | Time | Actions | Console errors | A11y critical/serious |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...rows.map((row) => (
      `| ${row.journey} | ${row.project} | ${row.score} | ${row.trustScore} | ${row.readinessScore} | ${(row.elapsedMs / 1000).toFixed(1)}s / ${row.targetSeconds}s | ${row.actionCount} / ${row.targetActions} | ${row.consoleErrors.length} | ${row.accessibility.critical}/${row.accessibility.serious} |`
    )),
    '',
    '## Journey Notes',
    '',
    ...rows.flatMap((row) => [
      `### ${row.journey}`,
      '',
      `Persona: ${row.persona}`,
      `Steps: ${row.steps.length ? row.steps.join(' -> ') : 'No completed steps'}`,
      `Trust checks: ${row.trustChecks.length ? row.trustChecks.map((item) => `${item.passed ? 'PASS' : 'GAP'} ${item.label}${item.detail ? ` (${item.detail})` : ''}`).join(' | ') : 'No additional trust checks'}`,
      `Screenshots: ${row.screenshots.length ? row.screenshots.join(' | ') : 'None'}`,
      `Accessibility findings: ${row.accessibility.violations.length ? row.accessibility.violations.map((item) => `${item.id} (${item.impact}, ${item.nodes}; ${item.targets.join(', ')})`).join(' | ') : 'None detected by axe'}`,
      `Console errors: ${row.consoleErrors.length ? row.consoleErrors.join(' | ') : 'None'}`,
      '',
    ]),
    'This score covers the scripted journeys above, not the whole product. Simulations measure task mechanics; Patrick\'s real usage remains the authority on usefulness and trust.',
    '',
  ].join('\n');
}

export default class UxBenchmarkReporter implements Reporter {
  private rows: ReportRow[] = [];

  onTestEnd(_test: TestCase, result: TestResult) {
    const metrics = parseMetrics(result);
    if (!metrics) return;
    this.rows.push({
      ...metrics,
      score: result.status === 'passed' ? metrics.score : 0,
      completed: result.status === 'passed' && metrics.completed,
      status: result.status,
      durationMs: result.duration,
    });
  }

  onEnd(result: FullResult) {
    const outputDir = path.resolve(process.cwd(), 'artifacts', 'ux-benchmark');
    mkdirSync(outputDir, { recursive: true });

    const scope = this.rows.length > 0 && this.rows.every((row) => row.project === 'real-map')
      ? 'real-map-latest'
      : 'local-latest';
    const payload = {
      generatedAt: new Date().toISOString(),
      status: result.status,
      averageMechanicalScore: this.rows.length
        ? Math.round((this.rows.reduce((sum, row) => sum + row.score, 0) / this.rows.length) * 10) / 10
        : 0,
      averageTrustScore: this.rows.length
        ? Math.round((this.rows.reduce((sum, row) => sum + row.trustScore, 0) / this.rows.length) * 10) / 10
        : 0,
      averageReadinessScore: this.rows.length
        ? Math.round((this.rows.reduce((sum, row) => sum + row.readinessScore, 0) / this.rows.length) * 10) / 10
        : 0,
      rows: this.rows,
    };
    const markdown = markdownFor(this.rows, result.status);

    writeFileSync(path.join(outputDir, `${scope}.json`), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(outputDir, `${scope}.md`), markdown);
    writeFileSync(path.join(outputDir, 'latest.json'), JSON.stringify(payload, null, 2));
    writeFileSync(path.join(outputDir, 'latest.md'), markdown);
  }
}
