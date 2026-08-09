import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./ProspectEditPanel.tsx', import.meta.url), 'utf8')

test('prospect activity query is gated by the selected Activity tab', () => {
  assert.match(source, /enabled:\s*Boolean\(prospect\.id\)\s*&&\s*activeTab\s*===\s*['"]activity['"]/)
})

test('prospect tabs are controlled so query gating follows the visible tab', () => {
  assert.match(source, /const \[activeTab, setActiveTab\] = useState\(['"]property['"]\)/)
  assert.match(source, /<Tabs value=\{activeTab\} onValueChange=\{setActiveTab\}/)
})
