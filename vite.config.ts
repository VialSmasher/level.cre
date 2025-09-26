import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const GOOGLE_ENABLED = (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

const isProd = process.env.NODE_ENV === 'production';
const overlayEnabled = !isProd && !['0','false','off'].includes(String(process.env.VITE_RUNTIME_OVERLAY || '').toLowerCase());
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  // Load env vars from the repo root (so .env at project root is used)
  envDir: path.resolve(__dirname),
  // Ensure Vite always uses the app-level PostCSS (Tailwind) config
  css: {
    postcss: path.resolve(__dirname, 'apps', 'web', 'postcss.config.cjs'),
    devSourcemap: true,
  },
  esbuild: {
    // Keep transforms light and modern for CI speed
    target: 'es2022',
    drop: ['console', 'debugger'],
    legalComments: 'none',
  },
  plugins: [
    react(),
    // Only enable the runtime overlay in development; it uses eval/Function
    ...(overlayEnabled ? [runtimeErrorOverlay()] : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps", "web", "src"),
      "@level-cre/shared": path.resolve(__dirname, "packages", "shared", "src"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
    // Ensure a single React instance across the app and packages
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(__dirname, "apps", "web"),
  build: {
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          maps: ['@react-google-maps/api', 'terra-draw', 'terra-draw-google-maps-adapter'],
          charts: ['recharts'],
          query: ['@tanstack/react-query'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
    outDir: path.resolve(__dirname, "apps", "web", "dist"),
    emptyOutDir: true,
  },
  server: {
    // Use Express middleware mode; port binding is handled by server/index.ts on 3000
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        // Allow Vite dev features and third-parties used by the app
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com https://replit.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
        "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
        // Include ws/wss for HMR and dev websocket connections
        "connect-src 'self' ws: wss: https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com",
        "img-src 'self' data: https: https://*.googleusercontent.com https://*.gstatic.com https://maps.gstatic.com",
        ...(GOOGLE_ENABLED ? ["frame-src https://accounts.google.com"] : [])
      ].join('; '),
    },
    // If your dev environment still injects restrictive CSP, disable the overlay
    // to avoid eval/new Function usage from error tools.
    hmr: { overlay: true },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      // Allow serving/reading files from monorepo roots (packages, apps) so
      // Tailwind's JIT content scanning and Vite dependency graph work properly.
      allow: [
        path.resolve(__dirname),
        path.resolve(__dirname, 'apps'),
        path.resolve(__dirname, 'packages'),
      ],
      deny: ["**/.*"],
    },
  },
});
