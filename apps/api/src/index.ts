import express, { type Request, Response, NextFunction } from "express";
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { devUser } from './auth/devUser';
import { registerRoutes } from "./routes";
import { pool } from './db';

const app = express();
app.set('trust proxy', 1);
// Allow API to be consumed cross-origin by the configured frontend
// Disable Helmet's own CSP so we can send a custom, environment-aware CSP below.
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Allow CORS for configured APP_ORIGIN(s) in any env
const allowedOriginsRaw = process.env.APP_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean) || [];
if (allowedOriginsRaw.length > 0) {
  // Support wildcard patterns like https://*.vercel.app via simple glob -> regex conversion
  const globToRegex = (pattern: string) => {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`);
  };
  const exacts = allowedOriginsRaw.filter(o => !o.includes('*'));
  const regexes = allowedOriginsRaw.filter(o => o.includes('*')).map(globToRegex);

  const corsOptions: cors.CorsOptions = {
    origin(origin, callback) {
      if (!origin) return callback(null, true); // non-browser or same-origin
      const allowed = exacts.includes(origin) || regexes.some(r => r.test(origin));
      callback(null, allowed);
    },
    credentials: true,
    methods: ['GET','POST','PATCH','DELETE','OPTIONS'],
    // Allow custom demo header for stateless demo mode, plus common auth/content headers
    allowedHeaders: ['Authorization','Content-Type','X-Demo-Mode'],
  };
  app.use(cors(corsOptions));
  // Handle preflight for all routes
  app.options('*', cors(corsOptions));
}

if (process.env.NODE_ENV === 'development') {
  // Add relaxed CSP for development
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      // Allow Vite HMR, dev overlays, and 3rd parties we use
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.supabase.co https://*.googleapis.com https://maps.googleapis.com https://*.google.com https://*.gstatic.com https://maps.gstatic.com https://replit.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
      // Include ws:/wss: so Vite's HMR and dev websocket can connect
      "connect-src 'self' ws: wss: https://*.supabase.co https://*.googleapis.com https://maps.googleapis.com https://*.google.com https://*.gstatic.com https://maps.gstatic.com",
      "img-src 'self' data: https: https://*.googleusercontent.com https://*.gstatic.com https://maps.gstatic.com",
      "frame-src https://accounts.google.com"
    ].join('; '));
    next();
  });
} else {
  // Add Content Security Policy headers for OAuth and maps
  app.use((req, res, next) => {
    // Allow eval and unsafe-inline for OAuth and Maps
    const cspPolicy = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob: https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com https://replit.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
      "connect-src 'self' ws: wss: https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com",
      "img-src 'self' data: https: https://*.googleusercontent.com https://*.gstatic.com https://maps.gstatic.com",
      "frame-src https://accounts.google.com"
    ].join('; ');

    res.setHeader('Content-Security-Policy', cspPolicy);
    next();
  });
}

// Ensure a secret for signed cookies; fallback in dev to avoid crashes
{
  const isDev = (process.env.NODE_ENV === 'development' || app.get('env') === 'development');
  const secret = process.env.JWT_SECRET || process.env.SUPABASE_JWT_SECRET || (isDev ? 'dev_change_me' : undefined);
  if (!secret) {
    console.warn('JWT_SECRET (or SUPABASE_JWT_SECRET) is not set. Signed cookies may not work correctly.');
  }
  app.use(cookieParser(secret || 'dev_change_me'));
}
app.use(devUser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const isDev = req.app?.get('env') === 'development';
  // Only capture and log response bodies in development
  if (isDev) {
    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    } as any;
  }

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (isDev && capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      console.log(logLine);
    }
  });

  next();
});

app.get('/health', async (req: Request, res: Response) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ ok: false, message: error.message });
  }
});
app.get('/healthz', (_, res) => res.send('ok'));
app.get('/api/ping', (req, res) => {
  const user = (req as any).user ?? null;
  res.json({ ok: true, user });
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err?.status || err?.statusCode || 500;
    const message = err?.message || 'Internal Server Error';
    if (app.get('env') === 'development') {
      console.error(err);
    }
    res.status(status).json({ message });
  });

  // In the monorepo, the API runs independently.
  // Bind on 0.0.0.0 and prefer PORT from env (Railway/Heroku style).
  const port = Number(process.env.PORT) || 3000;
  console.log(`[startup] DATABASE_URL ${process.env.DATABASE_URL ? 'present' : 'missing'}`);
  server.listen(port, '0.0.0.0', () => {
    const formattedTime = new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    console.log(`${formattedTime} [express] serving on port ${port}`);
  });
})();
