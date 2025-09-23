import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const GOOGLE_ENABLED = (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

const isProd = process.env.NODE_ENV === 'production';
const overlayEnabled = !isProd && !['0','false','off'].includes(String(process.env.VITE_RUNTIME_OVERLAY || '').toLowerCase());
export default defineConfig({
  // Load env vars from the repo root (so .env at project root is used)
  envDir: path.resolve(import.meta.dirname),
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
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
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
      deny: ["**/.*"],
    },
  },
});
