import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default {
  plugins: {
    // Point Tailwind to the repo-level config regardless of Vite root
    tailwindcss: { config: path.resolve(__dirname, 'tailwind.config.ts') },
    autoprefixer: {},
  },
}
