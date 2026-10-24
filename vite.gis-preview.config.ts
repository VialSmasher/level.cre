import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const root = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const previewTailwind = require('./apps/web/tailwind.config.cjs')
const publicPreviewOnly: Plugin = {
  name: 'public-gis-preview-only',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = (req.url || '').split('?')[0]
      if (pathname.startsWith('/api') && !['/api/property-gis/preview', '/api/property-gis/health'].includes(pathname)) {
        res.statusCode = 404
        res.end('Only the public GIS preview API is available here.')
        return
      }
      if (pathname === '/') { res.writeHead(302, { Location: '/gis-preview.html' }); res.end(); return }
      next()
    })
  },
}

// Separate entry and proxy: never starts the app API, reads its env, or loads CRM records.
export default defineConfig({
  root: path.join(root, 'apps/web'),
  // Vite 5 accepts a directory, not `false`. Keep app env files out of this entry.
  envDir: path.join(root, 'scripts/gis-preview-env'),
  envPrefix: 'PUBLIC_GIS_PREVIEW_ONLY_',
  plugins: [react(), publicPreviewOnly],
  // This entry runs from the repository root, unlike the web workspace command.
  // Resolve content explicitly so a clean checkout cannot render without utilities.
  css: { postcss: { plugins: [tailwindcss({
    ...previewTailwind,
    content: [path.join(root, 'apps/web/src/**/*.{html,js,jsx,ts,tsx}'), path.join(root, 'packages/shared/src/**/*.{html,js,jsx,ts,tsx}')],
  }), autoprefixer()] } },
  resolve: {
    alias: { '@': path.join(root, 'apps/web/src'), '@level-cre/shared': path.join(root, 'packages/shared/src') },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    host: '127.0.0.1', port: 5178, strictPort: true,
    proxy: { '/api/property-gis': { target: 'http://127.0.0.1:4175', changeOrigin: true } },
    fs: { strict: true, allow: [root], deny: ['**/.env*', '**/.git/**'] },
    headers: { 'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https://*.tile.openstreetmap.org https://unpkg.com; connect-src 'self' ws://127.0.0.1:5178; font-src 'self' data:; frame-src 'none'; object-src 'none'" },
  },
  build: {
    outDir: path.join(root, '.artifacts/gis-preview-dist'),
    rollupOptions: { input: path.join(root, 'apps/web/gis-preview.html') },
  },
})
