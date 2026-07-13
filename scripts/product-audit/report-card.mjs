import fs from 'node:fs'
import path from 'node:path'

const inputPath = path.resolve(process.argv[2] || 'docs/product-audits/level-cre-2026-07-13.json')
const outputPath = path.resolve(process.argv[3] || 'docs/product-audits/level-cre-2026-07-13.md')

const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const categories = input.categories || []
const totalWeight = categories.reduce((sum, category) => sum + Number(category.weight || 0), 0)

if (totalWeight !== 100) throw new Error(`Category weights must total 100; received ${totalWeight}.`)
if (categories.length === 0) throw new Error('At least one category is required.')

for (const category of categories) {
  for (const key of ['baseline', 'current']) {
    const value = Number(category[key])
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error(`${category.name} ${key} must be between 0 and 100.`)
    }
  }
  if (!['A', 'B', 'C', 'D'].includes(category.confidence)) {
    throw new Error(`${category.name} has an invalid confidence grade.`)
  }
}

const weightedScore = (key) => categories.reduce(
  (sum, category) => sum + (Number(category[key]) * Number(category.weight) / 100),
  0,
)

const baseline = weightedScore('baseline')
const current = weightedScore('current')
const delta = current - baseline

const grade = (score) => {
  if (score >= 90) return 'A'
  if (score >= 85) return 'A-'
  if (score >= 80) return 'B+'
  if (score >= 75) return 'B'
  if (score >= 70) return 'B-'
  if (score >= 65) return 'C+'
  if (score >= 60) return 'C'
  if (score >= 55) return 'C-'
  return 'D'
}

const confidenceValues = { A: 1, B: 0.8, C: 0.55, D: 0.3 }
const confidenceScore = categories.reduce(
  (sum, category) => sum + confidenceValues[category.confidence] * Number(category.weight) / 100,
  0,
)
const confidenceGrade = confidenceScore >= 0.9 ? 'A' : confidenceScore >= 0.7 ? 'B' : confidenceScore >= 0.5 ? 'C' : 'D'
const reportedBaseline = Number(baseline.toFixed(1))
const reportedCurrent = Number(current.toFixed(1))
const reportedDelta = Number(delta.toFixed(1))

const blockingFailures = (input.gates || []).filter((gate) => gate.blocking && gate.status === 'fail')
const partialClaims = (input.gates || []).filter((gate) => gate.status === 'partial')
const releaseVerdict = blockingFailures.length > 0
  ? 'Not pilot-ready'
  : reportedCurrent >= 90
    ? 'Category-leading candidate'
    : reportedCurrent >= 85
      ? 'Team-ready, subject to remaining gate proof'
      : reportedCurrent >= 75
        ? 'Controlled pilot'
        : reportedCurrent >= 65
          ? 'Founder-useful beta'
          : 'Prototype or narrow utility'

const formatScore = (value) => Number(value).toFixed(1)
const deltaLabel = (value) => `${value >= 0 ? '+' : ''}${formatScore(value)}`
const statusLabel = { pass: 'PASS', partial: 'PARTIAL', fail: 'FAIL' }

const lines = [
  `# ${input.product} Product Report Card`,
  '',
  `Audit date: ${input.auditDate}`,
  `Deployment: ${input.deploymentUrl}`,
  `Framework: ${input.frameworkVersion}`,
  '',
  '## Result',
  '',
  `**${formatScore(reportedCurrent)}/100 (${grade(reportedCurrent)})** after tune-up, from **${formatScore(reportedBaseline)}/100 (${grade(reportedBaseline)})** before tune-up (${deltaLabel(reportedDelta)}).`,
  '',
  `Release interpretation: **${releaseVerdict}**. Evidence confidence: **${confidenceGrade}**.`,
  '',
  '| Dimension | Weight | Before | Current | Delta | Confidence |',
  '| --- | ---: | ---: | ---: | ---: | :---: |',
  ...categories.map((category) => `| ${category.name} | ${category.weight} | ${category.baseline} | ${category.current} | ${deltaLabel(category.current - category.baseline)} | ${category.confidence} |`),
  '',
  '## Readiness Gates',
  '',
  ...(input.gates || []).map((gate) => `- **${statusLabel[gate.status] || gate.status}: ${gate.name}.** ${gate.evidence}`),
  '',
  '## Category Evidence',
  '',
  ...categories.flatMap((category) => [
    `### ${category.name} - ${category.current}/100`,
    '',
    category.rationale,
    '',
    ...category.evidence.map((item) => `- ${item}`),
    '',
  ]),
  '## Highest-Value Next Tune-Ups',
  '',
  ...(input.nextTuneUps || []).map((item, index) => `${index + 1}. **${item.title}:** ${item.reason}`),
  '',
  '## Evidence Limits',
  '',
  ...(input.evidenceLimits || []).map((item) => `- ${item}`),
  '',
]

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, lines.join('\n'))

const machineOutput = {
  product: input.product,
  auditDate: input.auditDate,
  baseline: reportedBaseline,
  current: reportedCurrent,
  delta: reportedDelta,
  grade: grade(reportedCurrent),
  confidence: confidenceGrade,
  verdict: releaseVerdict,
  blockingFailures: blockingFailures.map((gate) => gate.name),
  partialClaims: partialClaims.map((gate) => gate.name),
}

fs.writeFileSync(outputPath.replace(/\.md$/i, '.summary.json'), `${JSON.stringify(machineOutput, null, 2)}\n`)
console.log(JSON.stringify(machineOutput, null, 2))
