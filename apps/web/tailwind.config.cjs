/**
 * Tailwind CSS config for apps/web (CJS, local to app)
 * - Keeps scanning/content relative to this app for stability in monorepos
 * - Pulls in shared theme via CSS variables defined in index.css
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  // Consume the shared preset (theme + plugins)
  presets: [require('../../packages/shared/tailwind-preset.cjs')],
  content: [
    './index.html',
    './src/**/*.{html,js,jsx,ts,tsx,md,mdx}',
    '../../packages/shared/src/**/*.{html,js,jsx,ts,tsx,md,mdx}',
  ],
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
