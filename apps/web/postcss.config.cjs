const path = require('path');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

// Use explicit plugin instances to avoid any ambiguity with option passing
// and ensure Tailwind resolves the config from the monorepo root.
module.exports = {
  plugins: [
    tailwindcss({
      // Use the local app config for maximum stability in monorepos
      config: path.resolve(__dirname, './tailwind.config.cjs'),
    }),
    autoprefixer(),
  ],
};
