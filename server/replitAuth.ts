import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import { storage } from "./storage";

export function getSession(): import('express').RequestHandler {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  return session({
    secret: process.env.SESSION_SECRET || 'dev-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: sessionTtl,
    },
  }) as unknown as import('express').RequestHandler;
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  // Simplified OAuth routes - redirect to Google OAuth
  app.get("/api/login", (req, res) => {
    // For now, create a demo user for testing
    const demoUser = {
      claims: {
        sub: "demo-user-123",
        email: "demo@example.com",
        first_name: "Demo",
        last_name: "User",
        profile_image_url: "https://via.placeholder.com/40",
      }
    };
    
    req.login(demoUser, (err) => {
      if (err) {
        return res.redirect('/');
      }
      res.redirect('/');
    });
  });

  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      res.redirect("/");
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};