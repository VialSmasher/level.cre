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
  safelist: ['container'],
};
