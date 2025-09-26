const path = require('path');

// Ensure Vite (rooted at apps/web) picks up Tailwind + Autoprefixer
// while still reusing the monorepo's root Tailwind config.
module.exports = {
  plugins: {
    tailwindcss: { config: path.resolve(__dirname, '../../tailwind.config.ts') },
    autoprefixer: {},
  },
};

