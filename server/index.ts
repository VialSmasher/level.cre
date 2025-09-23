import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { devUser } from './src/auth/devUser.js';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { pool } from './db';

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Allow CORS for configured APP_ORIGIN(s) in any env
const allowedOrigins = process.env.APP_ORIGIN?.split(',').map(s => s.trim()).filter(Boolean);
if (allowedOrigins && allowedOrigins.length > 0) {
  app.use(cors({ origin: allowedOrigins, credentials: true }));
}

if (process.env.NODE_ENV === 'development') {
  // Add relaxed CSP for development
  app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.googleapis.com https://maps.googleapis.com https://*.google.com https://*.gstatic.com https://maps.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
      "connect-src 'self' https://*.googleapis.com https://maps.googleapis.com https://*.google.com https://*.gstatic.com https://maps.gstatic.com",
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
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com https://replit.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
      "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
      "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://*.gstatic.com https://maps.gstatic.com",
      "img-src 'self' data: https: https://*.googleusercontent.com https://*.gstatic.com https://maps.gstatic.com",
      "frame-src https://accounts.google.com"
    ].join('; ');

    res.setHeader('Content-Security-Policy', cspPolicy);
    next();
  });
}

console.log('JWT_SECRET at runtime:', process.env.JWT_SECRET);
app.use(cookieParser(process.env.JWT_SECRET));
app.use(devUser());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
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
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 3000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '3000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
