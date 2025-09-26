/**
 * Root Tailwind CSS config (CJS) consuming the shared preset.
 *
 * Note: apps/web uses its own local CJS config that also consumes this preset.
 * This root config exists for tooling consistency and optional root-level usage.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  presets: [require('./packages/shared/tailwind-preset.cjs')],
  // Intentionally omit scanning here to avoid ambiguity; apps own their content.
  content: [],
  // Safety net to ensure common utilities are available during dev even if
  // a watcher misses some files. Trim this later as desired.
  safelist: [
    'container',
    { pattern: /^(flex|inline-flex|grid|block|inline|hidden)$/ },
    { pattern: /^(items|justify|content)-(start|center|end|between|around|evenly)$/ },
    { pattern: /^(p|px|py|pt|pr|pb|pl|m|mx|my|mt|mr|mb|ml)-/ },
    { pattern: /^(w|h|min-w|min-h|max-w|max-h)-/ },
    { pattern: /^(text|bg|from|via|to|border|ring|fill|stroke)-/ },
    { pattern: /^(rounded|shadow|opacity|outline)-/ },
    { pattern: /^(col|row|gap)-/ },
    { pattern: /^(z|top|right|bottom|left)-/ },
    { pattern: /^(overflow|whitespace|break|truncate)/ },
    { pattern: /^(leading|tracking|font|uppercase|lowercase|capitalize)/ },
    { pattern: /^(transition|duration|ease|delay|animate)/ },
  ],
};
