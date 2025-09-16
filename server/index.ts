import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { initializeDatabase } from "./db";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add Content Security Policy headers for OAuth and maps
app.use((req, res, next) => {
  // Allow eval and unsafe-inline for OAuth and Maps
  const cspPolicy = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com https://replit.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://*.google.com https://maps.googleapis.com",
    "img-src 'self' data: https:",
    "frame-src https://accounts.google.com"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', cspPolicy);
  next();
});

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

// Environment variable validation
function validateEnvironmentVariables() {
  const requiredVars = ['DATABASE_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }
}

// Startup function with proper error handling
async function startServer() {
  try {
    // Validate environment variables first
    validateEnvironmentVariables();
    
    const port = parseInt(process.env.PORT || '5000', 10);
    const host = '0.0.0.0'; // Ensure we bind to external interface for deployments
    
    console.log(`Starting server on ${host}:${port}...`);
    
    // Initialize database connection
    console.log('Initializing database connection...');
    initializeDatabase();
    console.log('Database connection initialized');
    
    const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log the error for debugging
    console.error('Server error:', err);
    
    // Send error response if not already sent
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    
    // Don't throw after response - just log the error
  });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (process.env.NODE_ENV !== 'production') {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    server.listen({
      port,
      host,
      reusePort: true,
    }, () => {
      console.log(`Server successfully started on ${host}:${port}`);
      log(`serving on port ${port}`);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server with error handling
startServer();
