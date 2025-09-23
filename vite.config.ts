import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const GOOGLE_ENABLED = (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

export default defineConfig({
  // Load env vars from the repo root (so .env at project root is used)
  envDir: path.resolve(import.meta.dirname),
  plugins: [
    react(),
    runtimeErrorOverlay(),
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
    port: 5173,
    headers: {
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com https://replit.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
        "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
        "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com",
        "img-src 'self' data: https: https://*.googleusercontent.com https://*.gstatic.com https://maps.gstatic.com",
        ...(GOOGLE_ENABLED ? ["frame-src https://accounts.google.com"] : [])
      ].join('; '),
    },
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
