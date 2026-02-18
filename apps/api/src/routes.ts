import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { ensureUser } from './ensureUser';
import { getUserId, requireAuth, getUserFromBearerAuthHeader } from "./auth";
import { z } from 'zod';
import { ProspectGeometry, ProspectStatus, FollowUpTimeframe } from '@level-cre/shared/schema';
import { randomUUID } from 'crypto';
import * as demo from './demoStore';

function isDemo(req: Request): boolean {
  return req.headers['x-demo-mode'] === 'true' || process.env.VITE_DEMO_MODE === '1' || process.env.DEMO_MODE === '1';
}
import { createClient } from '@supabase/supabase-js';
import { pool, db } from './db';
import { listings, listingMembers, users, profiles, listingProspects } from '@level-cre/shared/schema';
import { and, eq, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { XP_VALUES, actionForInteractionType, xpForInteractionType } from './lib/gamification';

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Supabase client for server-side OAuth
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : null;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  const supabaseAdmin = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null;

  async function checkGoogleOAuthProvider(): Promise<{ ok: true } | { ok: false; message: string }> {
    if (!supabaseUrl || !supabaseKey) {
      return { ok: false, message: 'Google sign-in is not configured for this environment.' };
    }

    try {
      const authorizeUrl = new URL('/auth/v1/authorize', supabaseUrl);
      authorizeUrl.searchParams.set('provider', 'google');
      authorizeUrl.searchParams.set('redirect_to', 'https://example.com/auth/callback');
      authorizeUrl.searchParams.set('apikey', supabaseKey);

      const response = await fetch(authorizeUrl.toString(), {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(6000),
      });

      if (response.status >= 500) {
        return { ok: false, message: 'Google sign-in is temporarily unavailable. Please try again in a few minutes.' };
      }

      if (response.status >= 400) {
        return { ok: false, message: 'Google sign-in is currently unavailable. Please use Demo Mode and try again later.' };
      }

      return { ok: true };
    } catch (error: any) {
      console.error('Google OAuth provider check failed:', error?.message || error);
      return { ok: false, message: 'Google sign-in provider is unreachable right now. Please use Demo Mode and try again later.' };
    }
  }

  // Helpers: membership + role checks
  async function getListingRole(userId: string, listingId: string): Promise<'owner' | 'editor' | 'viewer' | null> {
    try {
      // Owner check
      const [row] = await db.select().from(listings).where(eq(listings.id, listingId));
      if (!row) return null;
      if (row.userId === userId) return 'owner';
      const [member] = await db.select().from(listingMembers).where(and(eq(listingMembers.listingId, listingId), eq(listingMembers.userId, userId)));
      return (member?.role as any) || null;
    } catch {
      return null;
    }
  }

  async function requireViewAccess(req: Request, listingId: string): Promise<'owner' | 'editor' | 'viewer'> {
    const userId = getUserId(req);
    if (isDemo(req)) {
      // Demo: owner if found under caller, else check membership store
      const owned = await demo.getListing(userId, listingId);
      if (owned) return 'owner';
      const role = await demo.getListingMemberRole(listingId, userId);
      if (role) return role as any;
      throw Object.assign(new Error('Forbidden'), { status: 403 });
    }
    const role = await getListingRole(userId, listingId);
    if (!role) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return role;
  }

  async function requireEditAccess(req: Request, listingId: string): Promise<'owner' | 'editor'> {
    const role = await requireViewAccess(req, listingId);
    if (role === 'owner' || role === 'editor') return role;
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  async function requireOwnerAccess(req: Request, listingId: string): Promise<'owner'> {
    const role = await requireViewAccess(req, listingId);
    if (role === 'owner') return 'owner';
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }

  // Helper: find userId by email using Supabase Admin if available, else local tables
  async function findUserIdByEmail(email: string): Promise<{ id: string, email: string } | null> {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return null;
    if (isDemo({ headers: {} } as any)) {
      if (normalized === 'demo@example.com') return { id: 'demo-user', email: 'demo@example.com' };
      return null;
    }
    try {
      // Prefer users table
      const [u] = await db.select().from(users).where(eq(users.email, normalized));
      if (u) return { id: u.id, email: u.email || normalized } as any;
    } catch {}
    try {
      const [p] = await db.select().from(profiles).where(eq(profiles.email, normalized));
      if (p) return { id: p.id, email: p.email || normalized } as any;
    } catch {}
    try {
      if (supabaseAdmin) {
        // @ts-ignore - admin API types may vary
        const { data, error } = await (supabaseAdmin as any).auth.admin.getUserByEmail(normalized);
        if (!error && data?.user) {
          return { id: data.user.id, email: data.user.email || normalized };
        }
      }
    } catch {}
    return null;
  }

  // Helper: resolve a user's email by id via local tables, then Supabase admin if necessary
  async function resolveEmailByUserId(userId: string): Promise<string | null> {
    try {
      const [u] = await db.select().from(users).where(eq(users.id, userId));
      if (u?.email) return u.email;
    } catch {}
    try {
      const [p] = await db.select().from(profiles).where(eq(profiles.id, userId));
      if (p?.email) return p.email as any;
    } catch {}
    try {
      if (supabaseAdmin) {
        // @ts-ignore admin API
        const { data, error } = await (supabaseAdmin as any).auth.admin.getUserById(userId);
        if (!error && data?.user) return data.user.email || null;
      }
    } catch {}
    return null;
  }

  const GOOGLE_ENABLED = (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true');

  // Lightweight health + readiness probe
  app.get('/api/health', async (_req, res) => {
    try {
      const postgisRes: any = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname='postgis') AS present`);
      const sridRes: any = await db.execute(sql`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_prospects_geometry_srid_4326') AS present`);
      const postgis = Boolean((postgisRes?.rows?.[0] || postgisRes?.[0])?.present);
      const srid4326Enforced = Boolean((sridRes?.rows?.[0] || sridRes?.[0])?.present);
      return res.json({ ok: true, postgis, srid4326Enforced });
    } catch (err) {
      const e: any = err;
      console.error('Health check failed:', { message: e?.message, code: e?.code });
      return res.status(500).json({ ok: false, error: e?.message || 'health failed' });
    }
  });

  if (GOOGLE_ENABLED) {
    app.get('/api/auth/google/status', async (_req, res) => {
      const status = await checkGoogleOAuthProvider();
      if (!status.ok) return res.status(503).json(status);
      return res.json(status);
    });

    // Simple redirect to Google OAuth - let Supabase handle everything
    app.get('/api/auth/google', async (req, res) => {
      if (!supabase) {
        return res.status(500).json({ error: 'Supabase not configured' });
      }
      
      // Prefer an explicit, non-wildcard app origin for redirect if provided
      const originCandidates = (process.env.APP_ORIGIN || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
      const reqHost = (req.get('host') || '').toLowerCase();
      // Prefer an explicit origin that matches current host (if any)
      const appOrigin = originCandidates.find(o => {
        if (o.includes('*')) return false;
        try {
          const u = new URL(o);
          return reqHost === u.host.toLowerCase();
        } catch { return false }
      });
      // Fallback protocol inference for logs and building the URL
      const host = req.get('host') || '';
      const inferredProtocol = (host.includes('replit.app') || host.includes('replit.dev')) ? 'https' : req.protocol;
      let redirectUrl: string;
      if (appOrigin) {
        redirectUrl = `${appOrigin.replace(/\/$/, '')}/auth/callback`;
      } else {
        // Fallback to current host
        redirectUrl = `${inferredProtocol}://${host}/auth/callback`;
      }
      
      if (req.app.get('env') === 'development') {
        console.log('OAuth Debug - Host:', host);
        console.log('OAuth Debug - Protocol:', inferredProtocol);
        console.log('OAuth Debug - Redirect URL:', redirectUrl);
      }
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { prompt: 'select_account', access_type: 'offline' },
          flowType: 'pkce',
        }
      });
      
      if (error) {
        console.error('OAuth initiation error:', error);
        return res.redirect(`/?error=${encodeURIComponent(error.message)}`);
      }
      
      if (req.app.get('env') === 'development') {
        console.log('OAuth Debug - Generated URL:', data.url);
      }
      
      if (data.url) {
        res.redirect(data.url);
      } else {
        res.redirect('/?error=no_oauth_url');
      }
    });
  } else {
    // Google OAuth disabled
    app.get('/api/auth/google', async (_req, res) => {
      return res.status(503).json({ error: 'Google OAuth is temporarily disabled' });
    });
  }

  // OAuth callback endpoint that Supabase/Google might hit (proxy -> client callback)
  app.get('/api/auth/callback', async (req, res) => {
    if (req.app.get('env') === 'development') {
      console.log('OAuth Callback - Query params:', req.query);
      console.log('OAuth Callback - Headers:', req.headers);
    }
    
    // Handle OAuth callback - redirect to client callback preserving query
    const { code, error: authError } = req.query;
    
    if (authError) {
      console.error('OAuth callback error:', authError);
      return res.redirect(`/?error=${encodeURIComponent(authError as string)}`);
    }
    
    // Redirect to client callback with original query string; client will exchange the code
    const appOrigin = process.env.APP_ORIGIN?.split(',')[0]?.trim();
    const qs = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    if (appOrigin) {
      return res.redirect(`${appOrigin.replace(/\/$/, '')}/auth/callback${qs}`);
    }
    res.redirect(`/auth/callback${qs}`);
  });

  // Removed stateful session endpoint (stateless auth only)

  // Logout endpoint (stateless) – nothing to clear server-side
  app.post('/api/auth/logout', async (_req, res) => {
    res.json({ success: true });
  });

  // Basic email+password login removed in favor of Google OAuth
  
  // Demo: reset persisted demo data (safe no-op outside demo mode)
  app.post('/api/demo/reset', async (req, res) => {
    if (!isDemo(req)) return res.status(403).json({ ok: false, message: 'Not in demo mode' });
    try {
      await demo.reset();
      res.json({ ok: true });
    } catch (e: any) {
      console.error('Demo reset error:', e);
      res.status(500).json({ ok: false, message: e.message || 'Failed to reset demo data' });
    }
  });

  // Read-only diagnostics: /api/diag/summary
  app.get('/api/diag/summary', async (req, res) => {
    try {
      const flag = String(process.env.NEXT_PUBLIC_ADMIN_DIAG_ENABLED || '').toLowerCase();
      const diagEnabled = ['1','true','yes','on'].includes(flag);
      if (!diagEnabled) {
        return res.status(404).json({ message: 'Not found' });
      }

      // Helper: safe filesystem route detection (scan web router file)
      const routesState = (() => {
        try {
          const repoRoot = path.resolve(process.cwd(), '..', '..');
          const appRouterPath = path.join(repoRoot, 'apps', 'web', 'src', 'App.tsx');
          const src = fs.readFileSync(appRouterPath, 'utf8');
          return {
            brokerStats: src.includes('/broker-stats') || src.includes('broker-stats'),
            leaderboard: src.includes('/leaderboard') || src.includes('leaderboard'),
          };
        } catch {
          return { brokerStats: null as any, leaderboard: null as any };
        }
      })();

      // Helper: does a table exist?
      const tableExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(`SELECT to_regclass('public.' || $1) AS oid`, [name]);
          const oid = rows?.[0]?.oid;
          return Boolean(oid);
        } catch {
          return false;
        }
      };

      // Helper: does an index exist exactly by name?
      const indexExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(
            `SELECT EXISTS (
               SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1
             ) AS present`,
            [name]
          );
          return Boolean(rows?.[0]?.present);
        } catch {
          return false;
        }
      };

      // API existence (by source scan of API routes)
      const apisState = (() => {
        try {
          const apiRoutesPath = path.join(path.resolve(process.cwd(), '..', '..'), 'apps', 'api', 'src', 'routes.ts');
          const src = fs.readFileSync(apiRoutesPath, 'utf8');
          return {
            statsHeader: src.includes("/api/stats/header"),
          };
        } catch {
          return { statsHeader: null as any };
        }
      })();

      // DB table checks
      const hasEvents = await tableExists('events');
      const hasAssets = await tableExists('assets');

      // Index checks (only meaningful if events exists)
      const eventsIdxTypeCreatedAt = hasEvents
        ? await indexExists('events_user_type_created_at')
        : false;
      const eventsIdxUserAsset = hasEvents
        ? await indexExists('events_user_asset')
        : false;

      // Event types in last 90 days (safe fallback to empty)
      let eventTypes90d: Array<{ type: string; count: number }> = [];
      if (hasEvents) {
        try {
          const { rows } = await pool.query(
            `SELECT type, COUNT(*)::int AS count
             FROM events
             WHERE created_at >= NOW() - INTERVAL '90 days'
             GROUP BY type
             ORDER BY count DESC`
          );
          eventTypes90d = rows || [];
        } catch {
          eventTypes90d = [];
        }
      } else {
        // Try a best-effort fallback to contact_interactions if present
        const hasInteractions = await tableExists('contact_interactions');
        if (hasInteractions) {
          try {
            const { rows } = await pool.query(
              `SELECT type, COUNT(*)::int AS count
               FROM contact_interactions
               WHERE created_at >= NOW() - INTERVAL '90 days'
               GROUP BY type
               ORDER BY count DESC`
            );
            eventTypes90d = rows || [];
          } catch {
            eventTypes90d = [];
          }
        }
      }

      // Sample aggregations for current user (best-effort, read-only)
      const userId = getUserId(req);
      let assetsTracked: number | null = null;
      let followupsLogged: number | null = null;
      let lastActivityISO: string | null = null;

      if (hasEvents) {
        try {
          const assetRes = await pool.query(
            `SELECT COUNT(DISTINCT asset_id)::int AS c FROM events WHERE user_id = $1`,
            [userId]
          );
          assetsTracked = assetRes?.rows?.[0]?.c ?? 0;
        } catch {}
        try {
          const fuRes = await pool.query(
            `SELECT COUNT(*)::int AS c
             FROM events
             WHERE user_id = $1 AND type = ANY($2)`,
            [userId, ['call','email','meeting','followup_logged']]
          );
          followupsLogged = fuRes?.rows?.[0]?.c ?? 0;
        } catch {}
        try {
          const lastRes = await pool.query(
            `SELECT MAX(created_at) AS last FROM events WHERE user_id = $1`,
            [userId]
          );
          const last = lastRes?.rows?.[0]?.last as Date | null;
          lastActivityISO = last ? new Date(last).toISOString() : null;
        } catch {}
      } else {
        // Fallbacks for current schema
        try {
          const hasProspects = await tableExists('prospects');
          if (hasProspects) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c FROM prospects WHERE user_id = $1`,
              [userId]
            );
            assetsTracked = r?.rows?.[0]?.c ?? 0;
          }
        } catch {}
        try {
          const hasInteractions = await tableExists('contact_interactions');
          if (hasInteractions) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c
               FROM contact_interactions
               WHERE user_id = $1 AND type = ANY($2)`,
              [userId, ['call','email','meeting','followup_logged']]
            );
            followupsLogged = r?.rows?.[0]?.c ?? 0;
            const lastR = await pool.query(
              `SELECT MAX(created_at) AS last FROM contact_interactions WHERE user_id = $1`,
              [userId]
            );
            const last = lastR?.rows?.[0]?.last as Date | null;
            lastActivityISO = last ? new Date(last).toISOString() : null;
          }
        } catch {}
        if (followupsLogged == null) {
          try {
            const hasTouches = await tableExists('touches');
            if (hasTouches) {
              const r = await pool.query(
                `SELECT COUNT(*)::int AS c
                 FROM touches
                 WHERE user_id = $1 AND kind = ANY($2)`,
                [userId, ['call','email','meeting','followup_logged']]
              );
              followupsLogged = r?.rows?.[0]?.c ?? 0;
              const lastR = await pool.query(
                `SELECT MAX(created_at) AS last FROM touches WHERE user_id = $1`,
                [userId]
              );
              const last = lastR?.rows?.[0]?.last as Date | null;
              lastActivityISO = last ? new Date(last).toISOString() : null;
            }
          } catch {}
        }
      }

      // Timezone and current week start (Monday 00:00 local)
      const tz = (() => {
        try {
          return (Intl.DateTimeFormat().resolvedOptions().timeZone) || null;
        } catch { return null; }
      })();
      const weekStartISO = (() => {
        try {
          const now = new Date();
          const day = now.getDay(); // 0=Sun,1=Mon,...
          const diffToMonday = (day === 0 ? -6 : 1 - day);
          const monday = new Date(now);
          monday.setDate(now.getDate() + diffToMonday);
          monday.setHours(0,0,0,0);
          return monday.toISOString();
        } catch { return null; }
      })();

      const payload = {
        routes: routesState,
        apis: apisState,
        db: { events: hasEvents, assets: hasAssets },
        eventTypes90d,
        indexes: {
          events_user_type_created_at: eventsIdxTypeCreatedAt,
          events_user_asset: eventsIdxUserAsset,
        },
        samples: {
          assetsTracked: assetsTracked ?? 0,
          followupsLogged: followupsLogged ?? 0,
          lastActivityISO: lastActivityISO,
        },
        tz,
        weekStartISO,
      };
      return res.json(payload);
    } catch (e: any) {
      const message = e?.message || 'diagnostic failed';
      return res.status(500).json({ message });
    }
  });
  // User endpoint - returns demo user for unauthenticated requests, real user for authenticated requests
  app.get('/api/auth/user', async (req, res) => {
    const authHeader = req.headers.authorization;
    const verified = await getUserFromBearerAuthHeader(authHeader);
    if (verified?.id) {
      const decoded = jwt.decode(authHeader!.slice(7)) as any;
      const user = {
        id: verified.id,
        email: verified.email ?? decoded?.email,
        firstName: decoded?.user_metadata?.full_name?.split(' ')[0] || 'User',
        lastName: decoded?.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
        profileImageUrl: decoded?.user_metadata?.avatar_url || null,
        createdAt: new Date(decoded?.created_at || Date.now()),
        updatedAt: new Date(),
      };
      return res.json(user);
    }
    
    // Fall back to demo user without touching DB in demo mode
    if (isDemo(req)) {
      return res.json({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // If not demo mode and no JWT, treat as unauthenticated
    res.status(401).json({ message: 'Not authenticated' });
  });

  // Demo bypass route for testing (stateless)
  app.post('/api/auth/demo', async (_req, res) => {
    try {
      const demoUser = await storage.upsertUser({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
      });
      res.json(demoUser);
    } catch (error) {
      console.error("Error creating demo user:", error);
      res.status(500).json({ message: "Failed to create demo user" });
    }
  });

  // Demo auth status (stateless) – use X-Demo-Mode header
  app.get('/api/auth/demo/user', async (req, res) => {
    if (req.headers['x-demo-mode'] === 'true') {
      return res.json({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    res.status(401).json({ message: 'Not authenticated' });
  });

  // Unified bootstrap endpoint
  app.get('/api/bootstrap', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const fromDemo = isDemo(req);
      let profile: any = null;
      if (fromDemo) {
        profile = await demo.getProfile(userId);
      } else {
        profile = await storage.getProfile(userId);
      }
      // user payload: prefer JWT claims if present
      let user: any = { id: userId };
      const authHeader = req.headers.authorization;
      try {
        if (authHeader?.startsWith('Bearer ')) {
          const decoded = jwt.decode(authHeader.slice(7)) as any;
          if (decoded) {
            user = {
              id: decoded.sub || userId,
              email: decoded.email,
              user_metadata: decoded.user_metadata,
              app_metadata: decoded.app_metadata,
              created_at: decoded.created_at,
            };
          }
        }
      } catch {}

      // Minimal app config
      const config = {
        features: {
          googleEnabled: (process.env.VITE_ENABLE_GOOGLE_AUTH === '1' || process.env.VITE_ENABLE_GOOGLE_AUTH === 'true')
        }
      };

      res.json({ user, profile, config });
    } catch (error: any) {
      console.error('Bootstrap error:', error?.message || error);
      res.status(500).json({ message: 'Failed to bootstrap' });
    }
  });
  // Profile routes
  app.get('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const profile = await demo.getProfile(userId);
        return res.json(profile);
      }
      const profile = await storage.getProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  // Listings (workspace) routes
  app.get('/api/listings', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const scope = String((req.query.scope as string) || '').toLowerCase();
      if (scope === 'shared') {
        if (isDemo(req)) {
          const list = await demo.getListingsSharedWith(userId);
          return res.json(list);
        }
        // Shared with current user via listing_members
        const rows = await db
          .select({
            id: listings.id,
            userId: listings.userId,
            title: listings.title,
            address: listings.address,
            lat: listings.lat,
            lng: listings.lng,
            submarket: listings.submarket,
            createdAt: listings.createdAt,
            archivedAt: listings.archivedAt,
            prospectCount: sql<number>`COALESCE((SELECT COUNT(*)::int FROM ${listingProspects} lp WHERE lp.listing_id = ${listings.id}), 0)`,
          })
          .from(listings)
          .innerJoin(listingMembers, and(eq(listingMembers.listingId, listings.id), eq(listingMembers.userId, userId)))
          .where(and(eq(sql`COALESCE(${listings.archivedAt} IS NULL, TRUE)`, true)));
        return res.json(rows);
      }
      if (isDemo(req)) {
        const list = await demo.getListings(userId);
        // Filter out archived items to match DB behavior
        const active = list.filter((l: any) => !l.archivedAt);
        // Enrich with prospect counts
        const links = await Promise.all(active.map(async (l: any) => {
          const linked = await demo.getListingLinks(userId, l.id);
          return { ...l, prospectCount: linked.length };
        }));
        return res.json(links);
      }
      const list = await storage.getListings(userId);
      res.json(list);
    } catch (error) {
      console.error('Error fetching listings:', error);
      res.status(500).json({ message: 'Failed to fetch listings' });
    }
  });

  app.post('/api/listings', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      console.log(`[route] POST /api/listings user=${userId} bodyKeys=${Object.keys(req.body||{}).join(',')}`);
      const { title, address, lat, lng, submarket, dealType, size, price } = req.body || {};
      if (!title || String(title).trim() === '') {
        return res.status(400).json({ message: 'title is required' });
      }
      if (isDemo(req)) {
        const item = {
          id: randomUUID(),
          userId,
          title: title.trim(),
          address: address || title.trim(),
          lat: lat || '',
          lng: lng || '',
          submarket: submarket || null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        await demo.addListing(userId, item);
        return res.status(201).json({ ...item, prospectCount: 0 });
      }
      const listing = await storage.createListing({ 
        userId, 
        title: title || address || 'Workspace', 
        address: (address && String(address).trim() !== '') ? address : (title || 'Workspace'), 
        lat: lat != null && lat !== '' ? String(lat) : null, 
        lng: lng != null && lng !== '' ? String(lng) : null, 
        submarket, 
        // avoid inserting columns that may not exist without migrations
      });
      const t1 = Date.now();
      console.log(`[route] POST /api/listings -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(listing);
    } catch (error) {
      console.error('Error creating listing:', error);
      res.status(500).json({ message: 'Failed to create listing' });
    }
  });

  app.get('/api/listings/:id', requireAuth, async (req, res) => {
    try {
      // Allow owner or members to view
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const demoListing = await demo.getListingAny(req.params.id);
        if (!demoListing) return res.status(404).json({ message: 'Listing not found' });
        return res.json(demoListing);
      }
      const listing = await storage.getListingAny(req.params.id);
      if (!listing) return res.status(404).json({ message: 'Listing not found' });
      res.json(listing);
    } catch (error) {
      console.error('Error getting listing:', error);
      res.status(500).json({ message: 'Failed to get listing' });
    }
  });

  app.post('/api/listings/:id/archive', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const okDemo = await demo.archiveListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Listing not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.archiveListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Listing not found' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error archiving listing:', error);
      res.status(500).json({ message: 'Failed to archive listing' });
    }
  });

  app.delete('/api/listings/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const okDemo = await demo.deleteListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Listing not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.deleteListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Listing not found' });
      res.json({ ok: true });
    } catch (error) {
      console.error('Error deleting listing:', error);
      res.status(500).json({ message: 'Failed to delete listing' });
    }
  });

  app.get('/api/listings/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const set = new Set(links.map((l: any) => l.prospectId));
        const items = (allProspects || []).filter((p: any) => set.has(p.id));
        return res.json(items);
      }
      const items = await storage.getListingProspectsAny(req.params.id);
      res.json(items);
    } catch (error) {
      console.error('Error fetching listing prospects:', error);
      res.status(500).json({ message: 'Failed to fetch listing prospects' });
    }
  });

  app.post('/api/listings/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireEditAccess(req, req.params.id);
      const { prospectId } = req.body || {};
      if (!prospectId) return res.status(400).json({ message: 'prospectId is required' });
      if (isDemo(req)) {
        const userId = getUserId(req);
        await demo.linkProspect(userId, req.params.id, prospectId);
        return res.status(201).json({ ok: true });
      }
      await storage.linkProspectToListingAny({ listingId: req.params.id, prospectId });
      res.status(201).json({ ok: true });
    } catch (error) {
      console.error('Error linking prospect:', error);
      // Handle unique violation gracefully
      return res.status(200).json({ ok: true });
    }
  });

  app.delete('/api/listings/:id/prospects/:prospectId', requireAuth, async (req, res) => {
    try {
      await requireEditAccess(req, req.params.id);
      if (isDemo(req)) {
        const userId = getUserId(req);
        const okDemo = await demo.unlinkProspect(userId, req.params.id, req.params.prospectId);
        if (!okDemo) return res.status(404).json({ message: 'Not linked' });
        return res.status(204).send();
      }
      const ok = await storage.unlinkProspectFromListingAny({ listingId: req.params.id, prospectId: req.params.prospectId });
      if (!ok) return res.status(404).json({ message: 'Not linked' });
      res.status(204).send();
    } catch (error) {
      console.error('Error unlinking prospect:', error);
      res.status(500).json({ message: 'Failed to unlink prospect' });
    }
  });

  app.get('/api/listings/:id/export', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      const userId = getUserId(req);
      const { start, end } = req.query as any;
      if (isDemo(req)) {
        const interactionsAll = await demo.getInteractions(userId);
        const interactions = (interactionsAll || []).filter((i: any) => i.listingId === req.params.id)
          .filter((i: any) => (!start || i.date >= start) && (!end || i.date <= end));
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const prospectMap = new Map(allProspects.map((p: any) => [p.id, p]));
        const byType: Record<string, number> = {};
        interactions.forEach((i: any) => { byType[i.type] = (byType[i.type] || 0) + 1; });
        const lines: string[] = [];
        lines.push('Summary');
        lines.push('Type,Count');
        Object.entries(byType).forEach(([t, c]) => lines.push(`${t},${c}`));
        lines.push('');
        lines.push('Details');
        lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
        interactions.forEach((i: any) => {
          const p: any = prospectMap.get(i.prospectId);
          const name = p?.name?.replaceAll(',', ' ') || '';
          const address = p?.name?.replaceAll(',', ' ') || '';
          const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
          const next = (i.nextFollowUp || '').replaceAll(',', ' ');
          lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
        });
        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="listing-${req.params.id}-export.csv"`);
        return res.send(csv);
      }
      const listing = await storage.getListing(req.params.id, userId);
      if (!listing) return res.status(404).json({ message: 'Listing not found' });
      const interactions = await storage.getContactInteractions(userId, undefined, req.params.id, start, end);
      const lp = await storage.getListingProspects(req.params.id, userId);
      const prospectMap = new Map(lp.map(p => [p.id, p]));
      const byType: Record<string, number> = {};
      interactions.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
      const summaryRows = Object.entries(byType).map(([type, count]) => ({ type, count }));
      // Build CSV
      const lines: string[] = [];
      lines.push('Summary');
      lines.push('Type,Count');
      summaryRows.forEach(r => lines.push(`${r.type},${r.count}`));
      lines.push('');
      lines.push('Details');
      lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
      interactions.forEach(i => {
        const p = prospectMap.get(i.prospectId as any);
        const name = p?.name?.replaceAll(',', ' ') || '';
        const address = p?.name?.replaceAll(',', ' ') || '';
        const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
        const next = (i.nextFollowUp || '').replaceAll(',', ' ');
        lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
      });
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="listing-${req.params.id}-export.csv"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting listing CSV:', error);
      res.status(500).json({ message: 'Failed to export CSV' });
    }
  });

  // Listing members (sharing)
  app.get('/api/listings/:id/members', requireAuth, async (req, res) => {
    try {
      // Any member (viewer/editor/owner) can view members list
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const list = await demo.getListingMembers(req.params.id);
        // Include owner
        const owner = await demo.getListingOwner(req.params.id);
        const ownerEntry = owner ? [{ userId: owner.userId, role: 'owner', email: owner.email }] : [];
        return res.json([...ownerEntry, ...list]);
      }
      // Fetch owner
      const [listRow] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (!listRow) return res.status(404).json({ message: 'Listing not found' });
      // Fetch members
      const members = await db.select().from(listingMembers).where(eq(listingMembers.listingId, req.params.id));
      // Resolve basic email from users/profiles
      const results: any[] = [];
      // Owner entry
      let ownerEmail: string | null = await resolveEmailByUserId(listRow.userId);
      results.push({ userId: listRow.userId, role: 'owner', email: ownerEmail });
      for (const m of members) {
        const email = await resolveEmailByUserId(m.userId);
        results.push({ userId: m.userId, role: m.role, email });
      }
      res.json(results);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error fetching listing members:', error);
      res.status(500).json({ message: 'Failed to fetch listing members' });
    }
  });

  app.post('/api/listings/:id/members', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      const { email, role } = req.body || {};
      if (!email) return res.status(400).json({ error: 'email is required' });
      if (isDemo(req)) {
        // Explicitly disallow invites in demo mode
        return res.status(400).json({ error: 'Invites disabled in demo mode' });
      }
      const roleValue = (role === 'editor' || role === 'viewer') ? role : 'viewer';
      // Lookup user by email
      const found = await findUserIdByEmail(email);
      if (!found) return res.status(404).json({ error: 'User not found' });
      // Ensure target user exists for FK, then upsert member
      await ensureUser(found.id, found.email);
      await db
        .insert(listingMembers)
        .values({ listingId: req.params.id, userId: found.id, role: roleValue })
        .onConflictDoUpdate({ target: [listingMembers.listingId, listingMembers.userId], set: { role: roleValue } });
      return res.status(201).json({ userId: found.id, email: found.email, role: roleValue });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error adding listing member:', error);
      res.status(500).json({ message: 'Failed to add listing member' });
    }
  });

  app.patch('/api/listings/:id/members/:userId', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      const role = req.body?.role;
      if (!role || !['owner', 'editor', 'viewer'].includes(role)) return res.status(400).json({ message: 'Invalid role' });
      if (isDemo(req)) {
        await demo.updateListingMember(req.params.id, req.params.userId, role);
        return res.json({ ok: true });
      }
      // Disallow changing owner record via members table
      const [row] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (row && row.userId === req.params.userId) return res.status(400).json({ message: 'Cannot change owner role' });
      await db.update(listingMembers)
        .set({ role })
        .where(and(eq(listingMembers.listingId, req.params.id), eq(listingMembers.userId, req.params.userId)));
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error updating listing member:', error);
      res.status(500).json({ message: 'Failed to update listing member' });
    }
  });

  app.delete('/api/listings/:id/members/:userId', requireAuth, async (req, res) => {
    try {
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        await demo.removeListingMember(req.params.id, req.params.userId);
        return res.status(204).send();
      }
      // Prevent removing owner
      const [row] = await db.select().from(listings).where(eq(listings.id, req.params.id));
      if (row && row.userId === req.params.userId) return res.status(400).json({ message: 'Cannot remove owner' });
      await db.delete(listingMembers).where(and(eq(listingMembers.listingId, req.params.id), eq(listingMembers.userId, req.params.userId)));
      res.status(204).send();
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error removing listing member:', error);
      res.status(500).json({ message: 'Failed to remove listing member' });
    }
  });

  // Workspaces alias routes (mirror Listings endpoints)
  // These provide a stable, user-facing naming while preserving DB schema names
  app.get('/api/workspaces', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getListings(userId);
        const active = list.filter((l: any) => !l.archivedAt);
        const links = await Promise.all(active.map(async (l: any) => {
          const linked = await demo.getListingLinks(userId, l.id);
          return { ...l, prospectCount: linked.length };
        }));
        return res.json(links);
      }
      const list = await storage.getListings(userId);
      res.json(list);
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ message: 'Failed to fetch workspaces' });
    }
  });

  app.post('/api/workspaces', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      const { title, address, lat, lng, submarket } = req.body || {};
      if (!title || String(title).trim() === '') {
        return res.status(400).json({ message: 'title is required' });
      }
      if (isDemo(req)) {
        const item = {
          id: randomUUID(),
          userId,
          title: title.trim(),
          address: address || title.trim(),
          lat: lat || '',
          lng: lng || '',
          submarket: submarket || null,
          createdAt: new Date().toISOString(),
          archivedAt: null,
        };
        await demo.addListing(userId, item);
        return res.status(201).json({ ...item, prospectCount: 0 });
      }
      const listing = await storage.createListing({ 
        userId, 
        title: title || address || 'Workspace', 
        address: (address && String(address).trim() !== '') ? address : (title || 'Workspace'), 
        lat: lat != null && lat !== '' ? String(lat) : null, 
        lng: lng != null && lng !== '' ? String(lng) : null, 
        submarket, 
      });
      const t1 = Date.now();
      console.log(`[route] POST /api/workspaces -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(listing);
    } catch (error) {
      console.error('Error creating workspace:', error);
      res.status(500).json({ message: 'Failed to create workspace' });
    }
  });

  app.get('/api/workspaces/:id', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const demoListing = await demo.getListingAny(req.params.id);
        if (!demoListing) return res.status(404).json({ message: 'Workspace not found' });
        return res.json(demoListing);
      }
      const listing = await storage.getListingAny(req.params.id);
      if (!listing) return res.status(404).json({ message: 'Workspace not found' });
      res.json(listing);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error getting workspace:', error);
      res.status(500).json({ message: 'Failed to get workspace' });
    }
  });

  app.post('/api/workspaces/:id/archive', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.archiveListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Workspace not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.archiveListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Workspace not found' });
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error archiving workspace:', error);
      res.status(500).json({ message: 'Failed to archive workspace' });
    }
  });

  app.delete('/api/workspaces/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireOwnerAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.deleteListing(userId, req.params.id);
        if (!okDemo) return res.status(404).json({ message: 'Workspace not found' });
        return res.json({ ok: true });
      }
      const ok = await storage.deleteListing(req.params.id, userId);
      if (!ok) return res.status(404).json({ message: 'Workspace not found' });
      res.json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error deleting workspace:', error);
      res.status(500).json({ message: 'Failed to delete workspace' });
    }
  });

  app.get('/api/workspaces/:id/prospects', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      if (isDemo(req)) {
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const set = new Set(links.map((l: any) => l.prospectId));
        const list = (allProspects || []).filter((p: any) => set.has(p.id));
        return res.json(list);
      }
      const list = await storage.getListingProspectsAny(req.params.id);
      res.json(list);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error fetching workspace prospects:', error);
      res.status(500).json({ message: 'Failed to fetch workspace prospects' });
    }
  });

  app.post('/api/workspaces/:id/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireEditAccess(req, req.params.id);
      const { prospectId } = req.body || {};
      if (!prospectId) return res.status(400).json({ message: 'prospectId is required' });
      if (isDemo(req)) {
        await demo.linkProspect(userId, req.params.id, prospectId);
        return res.status(201).json({ ok: true });
      }
      await storage.linkProspectToListingAny({ listingId: req.params.id, prospectId });
      res.status(201).json({ ok: true });
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error linking prospect:', error);
      res.status(500).json({ message: 'Failed to link prospect' });
    }
  });

  app.delete('/api/workspaces/:id/prospects/:prospectId', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      await requireEditAccess(req, req.params.id);
      if (isDemo(req)) {
        const okDemo = await demo.unlinkProspect(userId, req.params.id, req.params.prospectId);
        if (!okDemo) return res.status(404).json({ message: 'Not linked' });
        return res.status(204).send();
      }
      const ok = await storage.unlinkProspectFromListingAny({ listingId: req.params.id, prospectId: req.params.prospectId });
      if (!ok) return res.status(404).json({ message: 'Not linked' });
      res.status(204).send();
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error unlinking prospect:', error);
      res.status(500).json({ message: 'Failed to unlink prospect' });
    }
  });

  app.get('/api/workspaces/:id/export', requireAuth, async (req, res) => {
    try {
      await requireViewAccess(req, req.params.id);
      const userId = getUserId(req);
      const { start, end } = req.query as any;
      if (isDemo(req)) {
        const interactionsAll = await demo.getInteractions(userId);
        const interactions = (interactionsAll || []).filter((i: any) => i.listingId === req.params.id)
          .filter((i: any) => (!start || i.date >= start) && (!end || i.date <= end));
        const links = await demo.getListingLinksAll(req.params.id);
        const allProspects = await demo.getProspectsAll();
        const prospectMap = new Map(allProspects.map((p: any) => [p.id, p]));
        const byType: Record<string, number> = {};
        interactions.forEach((i: any) => { byType[i.type] = (byType[i.type] || 0) + 1; });
        const lines: string[] = [];
        lines.push('Summary');
        lines.push('Type,Count');
        Object.entries(byType).forEach(([t, c]) => lines.push(`${t},${c}`));
        lines.push('');
        lines.push('Details');
        lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
        interactions.forEach((i: any) => {
          const p: any = prospectMap.get(i.prospectId);
          const name = p?.name?.replaceAll(',', ' ') || '';
          const address = p?.name?.replaceAll(',', ' ') || '';
          const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
          const next = (i.nextFollowUp || '').replaceAll(',', ' ');
          lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
        });
        const csv = lines.join('\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="workspace-${req.params.id}-export.csv"`);
        return res.send(csv);
      }
      const listing = await storage.getListingAny(req.params.id);
      if (!listing) return res.status(404).json({ message: 'Workspace not found' });
      const interactions = await storage.getContactInteractions(userId, undefined, req.params.id, start, end);
      const lp = await storage.getListingProspectsAny(req.params.id);
      const prospectMap = new Map(lp.map(p => [p.id, p]));
      const byType: Record<string, number> = {};
      interactions.forEach(i => { byType[i.type] = (byType[i.type] || 0) + 1; });
      const summaryRows = Object.entries(byType).map(([type, count]) => ({ type, count }));
      const lines: string[] = [];
      lines.push('Summary');
      lines.push('Type,Count');
      summaryRows.forEach(r => lines.push(`${r.type},${r.count}`));
      lines.push('');
      lines.push('Details');
      lines.push('Date,Type,Prospect,Address,Notes,NextSteps');
      interactions.forEach(i => {
        const p = prospectMap.get(i.prospectId as any);
        const name = p?.name?.replaceAll(',', ' ') || '';
        const address = p?.name?.replaceAll(',', ' ') || '';
        const notes = (i.notes || '').replaceAll('\n', ' ').replaceAll(',', ' ');
        const next = (i.nextFollowUp || '').replaceAll(',', ' ');
        lines.push(`${i.date},${i.type},${name},${address},${notes},${next}`);
      });
      const csv = lines.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="workspace-${req.params.id}-export.csv"`);
      res.send(csv);
    } catch (error: any) {
      const status = (error && typeof error === 'object' && (error as any).status) || 500;
      if (status !== 500) return res.status(status).json({ message: 'Forbidden' });
      console.error('Error exporting workspace CSV:', error);
      res.status(500).json({ message: 'Failed to export CSV' });
    }
  });

  app.post('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      console.log("Creating profile for user:", userId);
      console.log("Profile data:", req.body);
      
      const profileData = {
        id: userId,
        ...req.body
      };
      if (isDemo(req)) {
        const saved = await demo.setProfile(userId, profileData);
        return res.json(saved);
      }
      try {
        const profile = await storage.createProfile(profileData);
        console.log("Profile created successfully:", profile);
        return res.json(profile);
      } catch (e: any) {
        const code = e?.code || e?.originalError?.code;
        const msg = String(e?.message || '').toLowerCase();
        // Unique violation (duplicate primary key) -> treat as conflict so client can PATCH
        if (code === '23505' || msg.includes('duplicate key')) {
          return res.status(409).json({ message: 'Profile already exists' });
        }
        console.error('Error creating profile:', e);
        console.error('Stack trace:', e?.stack);
        return res.status(500).json({ message: 'Failed to create profile' });
      }
    } catch (error: any) {
      console.error("Error creating profile:", error);
      console.error("Stack trace:", error?.stack);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateProfile(userId, req.body);
        return res.json(updated);
      }
      const profile = await storage.updateProfile(userId, req.body);
      if (!profile) {
        return res.status(404).json({ message: "Profile not found" });
      }
      
      // Sync submarkets from profile to submarkets table - disabled for now
      // if (req.body.submarkets) {
      //   await syncProfileSubmarkets(userId, req.body.submarkets);
      // }

      res.json(profile);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Requirements routes with user association
  app.get('/api/requirements', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getRequirements(userId);
        return res.json(list);
      }
      const requirements = await storage.getAllRequirements(userId);
      res.json(requirements);
    } catch (error) {
      console.error("Error fetching requirements:", error);
      res.status(500).json({ message: "Failed to fetch requirements" });
    }
  });

  app.post('/api/requirements', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          title: req.body.title,
          source: req.body.source ?? null,
          location: req.body.location ?? null,
          contactName: req.body.contactName ?? null,
          contactEmail: req.body.contactEmail ?? null,
          contactPhone: req.body.contactPhone ?? null,
          spaceSize: req.body.spaceSize ?? null,
          timeline: req.body.timeline ?? null,
          status: req.body.status || 'active',
          tags: req.body.tags || [],
          notes: req.body.notes ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addRequirement(userId, created);
        return res.status(201).json(created);
      }
      const requirement = await storage.createRequirement({
        ...req.body,
        userId
      });
      res.status(201).json(requirement);
    } catch (error) {
      console.error("Error creating requirement:", error);
      res.status(500).json({ message: "Failed to create requirement" });
    }
  });

  app.patch('/api/requirements/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateRequirement(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Requirement not found' });
        return res.json(updated);
      }
      const requirement = await storage.updateRequirement(req.params.id, userId, req.body);
      if (!requirement) {
        return res.status(404).json({ message: "Requirement not found" });
      }
      res.json(requirement);
    } catch (error) {
      console.error("Error updating requirement:", error);
      res.status(500).json({ message: "Failed to update requirement" });
    }
  });

  app.delete('/api/requirements/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteRequirement(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Requirement not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteRequirement(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Requirement not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting requirement:", error);
      res.status(500).json({ message: "Failed to delete requirement" });
    }
  });

  // Market Comps routes with user association
  app.get('/api/market-comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getMarketComps(userId);
        return res.json(list);
      }
      const comps = await storage.getAllMarketComps(userId);
      res.json(comps);
    } catch (error) {
      console.error('Error fetching market comps:', error);
      res.status(500).json({ message: 'Failed to fetch market comps' });
    }
  });

  app.post('/api/market-comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          address: req.body.address,
          submarket: req.body.submarket ?? null,
          assetType: req.body.assetType,
          buildingSize: req.body.buildingSize ?? null,
          landSize: req.body.landSize ?? null,
          sourceLink: req.body.sourceLink ?? null,
          notes: req.body.notes ?? null,
          dealType: req.body.dealType,
          tenant: req.body.tenant ?? null,
          termMonths: req.body.termMonths ?? null,
          rate: req.body.rate ?? null,
          rateType: req.body.rateType ?? null,
          commencement: req.body.commencement ?? null,
          concessions: req.body.concessions ?? null,
          saleDate: req.body.saleDate ?? null,
          buyer: req.body.buyer ?? null,
          seller: req.body.seller ?? null,
          price: req.body.price ?? null,
          pricePerSf: req.body.pricePerSf ?? null,
          pricePerAcre: req.body.pricePerAcre ?? null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addMarketComp(userId, created);
        return res.status(201).json(created);
      }
      const comp = await storage.createMarketComp({ ...req.body, userId });
      res.status(201).json(comp);
    } catch (error) {
      console.error('Error creating market comp:', error);
      res.status(500).json({ message: 'Failed to create market comp' });
    }
  });

  app.patch('/api/market-comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateMarketComp(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Market comp not found' });
        return res.json(updated);
      }
      const comp = await storage.updateMarketComp(req.params.id, userId, req.body);
      if (!comp) {
        return res.status(404).json({ message: 'Market comp not found' });
      }
      res.json(comp);
    } catch (error) {
      console.error('Error updating market comp:', error);
      res.status(500).json({ message: 'Failed to update market comp' });
    }
  });

  app.delete('/api/market-comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteMarketComp(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Market comp not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteMarketComp(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Market comp not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting market comp:', error);
      res.status(500).json({ message: 'Failed to delete market comp' });
    }
  });

  // Prospects routes with user association
  app.get('/api/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getProspects(userId);
        return res.json(list);
      }
      const prospects = await storage.getAllProspects(userId);
      res.json(prospects);
    } catch (error) {
      console.error("Error fetching prospects:", error);
      res.status(500).json({ message: "Failed to fetch prospects" });
    }
  });

  app.post('/api/prospects', requireAuth, async (req, res) => {
    const t0 = Date.now();
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      console.log(`[route] POST /api/prospects user=${userId} bodyKeys=${Object.keys(req.body||{}).join(',')}`);
      // Validate payload to match client shape (uses GeoJSON geometry)
      const ProspectInputSchema = z.object({
        name: z.string().min(1),
        status: ProspectStatus.default('prospect'),
        notes: z.string().optional().default(''),
        geometry: ProspectGeometry,
        submarketId: z.string().optional(),
        lastContactDate: z.string().optional(),
        followUpTimeframe: FollowUpTimeframe.optional(),
        followUpDueDate: z.string().optional(),
        // Contact and business info
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        contactCompany: z.string().optional(),
        size: z.string().optional(),
        acres: z.string().optional(),
        businessName: z.string().optional(),
        websiteUrl: z.string().optional(),
      });

      const parseResult = ProspectInputSchema.safeParse(req.body);
      if (!parseResult.success) {
        console.error('Prospect validation error:', parseResult.error);
        return res.status(400).json({ message: 'Invalid prospect data', error: parseResult.error.errors });
      }

      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          ...parseResult.data,
          createdDate: new Date().toISOString(),
        };
        await demo.addProspect(userId, created);
        return res.status(201).json(created);
      }

      const prospect = await storage.createProspect({ ...parseResult.data, userId });
      const t1 = Date.now();
      console.log(`[route] POST /api/prospects -> 201 in ${t1 - t0}ms user=${userId}`);
      res.status(201).json(prospect);
    } catch (e) {
      const err: any = e;
      console.error('Error creating prospect:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        stack: err?.stack,
      });
      res.status(500).json({ message: 'Failed to create prospect', error: err?.message || String(err) });
    }
  });

  app.patch('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const ProspectPatchSchema = z.object({
        name: z.string().min(1).optional(),
        status: ProspectStatus.optional(),
        notes: z.string().optional(),
        geometry: ProspectGeometry.optional(),
        submarketId: z.string().optional(),
        lastContactDate: z.string().optional(),
        followUpTimeframe: FollowUpTimeframe.optional(),
        followUpDueDate: z.string().optional(),
        contactName: z.string().optional(),
        contactEmail: z.string().optional(),
        contactPhone: z.string().optional(),
        contactCompany: z.string().optional(),
        size: z.string().optional(),
        acres: z.string().optional(),
        businessName: z.string().optional(),
        websiteUrl: z.string().optional(),
      }).strict();

      const parseResult = ProspectPatchSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ message: 'Invalid prospect patch data', error: parseResult.error.errors });
      }

      if (isDemo(req)) {
        const updated = await demo.updateProspect(userId, req.params.id, parseResult.data);
        if (!updated) return res.status(404).json({ message: 'Prospect not found' });
        return res.json({ ...updated, newXpGained: 0 });
      }
      const result = await storage.updateProspect(req.params.id, userId, parseResult.data);
      if (!result) {
        return res.status(404).json({ message: "Prospect not found" });
      }
      res.json({ ...result.prospect, newXpGained: result.newXpGained });
    } catch (e) {
      const err: any = e;
      console.error('Error updating prospect:', {
        message: err?.message,
        code: err?.code,
        detail: err?.detail,
        constraint: err?.constraint,
        table: err?.table,
        stack: err?.stack,
      });
      res.status(500).json({ message: 'Failed to update prospect', error: err?.message || String(err) });
    }
  });

  app.delete('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        await demo.deleteProspect(userId, req.params.id);
        return res.status(204).send();
      }
      const deleted = await storage.deleteProspect(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Prospect not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting prospect:", error);
      res.status(500).json({ message: "Failed to delete prospect" });
    }
  });

  // Submarkets routes with user association
  app.get('/api/submarkets', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const list = await demo.getSubmarkets(userId);
        // Deduplicate by name (case-insensitive) and prefer active entries.
        const seen = new Set<string>();
        const unique: any[] = [];
        for (const s of (list || [])) {
          const name = (s?.name || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          const isActive = (s?.isActive !== false);
          if (seen.has(key)) continue;
          if (!isActive) continue;
          seen.add(key);
          unique.push({ id: s.id, name: s.name, color: s.color, isActive: !!s.isActive });
        }
        return res.json(unique);
      }
      const submarkets = await storage.getAllSubmarkets(userId);
      res.json(submarkets);
    } catch (error) {
      console.error("Error fetching submarkets:", error);
      res.status(500).json({ message: "Failed to fetch submarkets" });
    }
  });

  app.post('/api/submarkets', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const created = {
          id: randomUUID(),
          userId,
          name: req.body.name,
          color: req.body.color || null,
          isActive: !!req.body.isActive,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await demo.addSubmarket(userId, created);
        return res.status(201).json(created);
      }
      const submarket = await storage.createSubmarket({
        ...req.body,
        userId
      });
      res.status(201).json(submarket);
    } catch (error) {
      console.error("Error creating submarket:", error);
      res.status(500).json({ message: "Failed to create submarket" });
    }
  });

  app.patch('/api/submarkets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      if (isDemo(req)) {
        const updated = await demo.updateSubmarket(userId, req.params.id, req.body);
        if (!updated) return res.status(404).json({ message: 'Submarket not found' });
        return res.json(updated);
      }
      const submarket = await storage.updateSubmarket(req.params.id, userId, req.body);
      if (!submarket) {
        return res.status(404).json({ message: "Submarket not found" });
      }
      res.json(submarket);
    } catch (error) {
      console.error("Error updating submarket:", error);
      res.status(500).json({ message: "Failed to update submarket" });
    }
  });

  app.delete('/api/submarkets/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteSubmarket(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Submarket not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteSubmarket(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Submarket not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting submarket:", error);
      res.status(500).json({ message: "Failed to delete submarket" });
    }
  });

  // Contact interactions routes
  app.get('/api/interactions', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const prospectId = req.query.prospectId as string;
      if (isDemo(req)) {
        const interactions = await demo.getInteractions(userId, prospectId);
        return res.json(interactions);
      }
      const interactions = await storage.getContactInteractions(userId, prospectId);
      res.json(interactions);
    } catch (error) {
      console.error('Error getting contact interactions:', error);
      res.status(500).json({ message: 'Failed to get contact interactions' });
    }
  });

  app.post('/api/interactions', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const interactionData = {
        userId,
        prospectId: req.body.prospectId,
        date: req.body.date,
        type: req.body.type,
        outcome: req.body.outcome,
        notes: req.body.notes || '',
        nextFollowUp: req.body.nextFollowUp || null,
        listingId: req.body.listingId || null,
      };
      if (interactionData.listingId) {
        // Require edit access when attaching to a listing
        await requireEditAccess(req, interactionData.listingId);
      }
      if (isDemo(req)) {
        const created = { id: randomUUID(), ...interactionData, createdAt: new Date().toISOString() };
        await demo.addInteraction(userId, created);
        return res.json(created);
      }

      const interaction = await storage.createContactInteraction(interactionData);
      res.json(interaction);
    } catch (error) {
      console.error('Error creating contact interaction:', error);
      res.status(500).json({ message: 'Failed to create contact interaction' });
    }
  });

  app.delete('/api/interactions/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        const ok = await demo.deleteInteraction(userId, req.params.id);
        if (!ok) return res.status(404).json({ message: 'Interaction not found' });
        return res.status(204).send();
      }
      const deleted = await storage.deleteContactInteraction(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: 'Interaction not found' });
      }
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting contact interaction:', error);
      res.status(500).json({ message: 'Failed to delete contact interaction' });
    }
  });

  // Broker Skills Routes
  app.get('/api/stats/header', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const qUser = ((req.query.userId as string) || 'me').toLowerCase();
      if (qUser !== 'me' && qUser !== userId) {
        // Only self queries supported; deny others
        return res.status(403).json({ message: 'Forbidden' });
      }

      // Helper: does a table exist?
      const tableExists = async (name: string): Promise<boolean> => {
        try {
          const { rows } = await pool.query(`SELECT to_regclass('public.' || $1) AS oid`, [name]);
          const oid = rows?.[0]?.oid;
          return Boolean(oid);
        } catch {
          return false;
        }
      };

      // Compute level and streak from existing skills source
      const levelFromXp = (xp: number) => Math.min(99, Math.floor(Math.sqrt(xp / 100)));
      const edmTz = 'America/Edmonton';
      const followUpCountActions = new Set([
        'call',
        'email',
        'meeting',
        'phone_call',
        'email_sent',
        'meeting_held',
        'followup_logged',
        'interaction',
        'note_added',
      ]);
      const getDatePartsInTimeZone = (date: Date, timeZone: string) => {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).formatToParts(date);
        const get = (type: 'year' | 'month' | 'day') => Number(parts.find((p) => p.type === type)?.value || '0');
        return { year: get('year'), month: get('month'), day: get('day') };
      };
      const getWeekKeyInTimeZone = (date: Date, timeZone: string) => {
        const { year, month, day } = getDatePartsInTimeZone(date, timeZone);
        const localDateAsUtc = new Date(Date.UTC(year, month - 1, day));
        const dow = localDateAsUtc.getUTCDay();
        const diffToMonday = dow === 0 ? -6 : 1 - dow;
        localDateAsUtc.setUTCDate(localDateAsUtc.getUTCDate() + diffToMonday);
        return `${localDateAsUtc.getUTCFullYear()}-${String(localDateAsUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(localDateAsUtc.getUTCDate()).padStart(2, '0')}`;
      };
      const currentWeekKey = getWeekKeyInTimeZone(new Date(), edmTz);
      let totalLevel = 0;
      let streakDays = 0;
      let demoProspects: any[] = [];
      let demoInteractions: any[] = [];

      if (isDemo(req)) {
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);
        demoProspects = prospects || [];
        demoInteractions = interactions || [];
        const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING;
        const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
          if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
            return sum + xpForInteractionType(i.type);
          }
          return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
        }, 0);
        const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;
        const daysSet = new Set((interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString()));
        streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
        const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
        totalLevel =
          levelFromXp(prospectingXp) +
          levelFromXp(followUpXp) +
          levelFromXp(consistencyXp) +
          levelFromXp(marketKnowledgeXp);
      } else {
        try {
          const skills = await storage.getBrokerSkills(userId);
          const p = skills?.prospecting || 0;
          const f = skills?.followUp || 0;
          const c = skills?.consistency || 0;
          const m = skills?.marketKnowledge || 0;
          streakDays = skills?.streakDays || 0;
          totalLevel = levelFromXp(p) + levelFromXp(f) + levelFromXp(c) + levelFromXp(m);
        } catch {
          totalLevel = 0;
          streakDays = 0;
        }
      }

      // Aggregations: prefer events; fallback to current tables
      let assetsTracked = 0;
      let followupsLogged = 0;

      if (isDemo(req)) {
        assetsTracked = demoProspects.length;
        followupsLogged = demoInteractions.filter((i: any) => {
          const date = new Date(i?.date || i?.createdAt || Date.now());
          if (getWeekKeyInTimeZone(date, edmTz) !== currentWeekKey) return false;
          const type = String(i?.type || '').toLowerCase();
          return followUpCountActions.has(type);
        }).length;
      } else {
        // Assets Tracked must be all-time count of prospects (not week-filtered).
        try {
          if (await tableExists('prospects')) {
            const r = await pool.query(
              `SELECT COUNT(*)::int AS c FROM prospects`
            );
            assetsTracked = r?.rows?.[0]?.c ?? 0;
          }
        } catch {}

        const hasEvents = await tableExists('events');
        if (hasEvents) {
          // events table is retained for diagnostics/legacy support; follow-ups counter now comes
          // from weekly skill activities to match the Broker Stats performance ring.
        }

        // Follow-Ups Logged: current Edmonton week, from skill activities when available.
        let followupsCountedFromActivities = false;
        try {
          if (await tableExists('skill_activities')) {
            const r = await pool.query(
              `SELECT timestamp, action
                 FROM skill_activities
                WHERE user_id = $1
                  AND skill_type = $2`,
              [userId, 'followUp']
            );
            const rows = r?.rows || [];
            followupsLogged = rows.filter((row: any) => {
              const action = String(row?.action || '').toLowerCase();
              if (!followUpCountActions.has(action)) return false;
              const ts = new Date(row?.timestamp || Date.now());
              return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
            }).length;
            followupsCountedFromActivities = true;
          }
        } catch {}

        if (!followupsCountedFromActivities) {
          // Fallbacks
          try {
            if (await tableExists('contact_interactions')) {
              const r = await pool.query(
                `SELECT date, type
                   FROM contact_interactions
                  WHERE user_id = $1`,
                [userId]
              );
              const rows = r?.rows || [];
              followupsLogged = rows.filter((row: any) => {
                const type = String(row?.type || '').toLowerCase();
                if (!followUpCountActions.has(type)) return false;
                const ts = new Date(row?.date || Date.now());
                return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
              }).length;
            } else if (await tableExists('touches')) {
              const r = await pool.query(
                `SELECT created_at, kind
                   FROM touches
                  WHERE user_id = $1`,
                [userId]
              );
              const rows = r?.rows || [];
              followupsLogged = rows.filter((row: any) => {
                const kind = String(row?.kind || '').toLowerCase();
                if (!followUpCountActions.has(kind)) return false;
                const ts = new Date(row?.created_at || Date.now());
                return getWeekKeyInTimeZone(ts, edmTz) === currentWeekKey;
              }).length;
            }
          } catch {}
        }
      }

      return res.json({ totalLevel, assetsTracked, followupsLogged, streakDays });
    } catch (error) {
      console.error('Error fetching stats header:', error);
      res.status(500).json({ message: 'Failed to fetch header stats' });
    }
  });
  app.get('/api/skills', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (isDemo(req)) {
        // Compute demo skills from demo data
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);

        const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING; // Add prospect

        const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
          if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
            return sum + xpForInteractionType(i.type);
          }
          return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
        }, 0);

        const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;

        // Consistency XP per distinct active day
        const daysSet = new Set(
          (interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString())
        );
        const streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
        const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
        const lastActivity = (interactions || []).length > 0
          ? new Date((interactions || [])[(interactions || []).length - 1].date || Date.now()).toISOString()
          : new Date().toISOString();

        return res.json({
          id: 'demo-skill',
          userId,
          prospecting: prospectingXp,
          followUp: followUpXp,
          consistency: consistencyXp,
          marketKnowledge: marketKnowledgeXp,
          lastActivity,
          streakDays,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      const skills = await storage.getBrokerSkills(userId);
      res.json(skills);
    } catch (error) {
      console.error('Error fetching broker skills:', error);
      res.status(500).json({ message: 'Failed to fetch broker skills' });
    }
  });

  // Diagnostics: check DB connectivity and required tables
  app.get('/api/_diag/db', async (req, res) => {
    // Hide diagnostics outside development to avoid schema leakage
    if (req.app.get('env') !== 'development') {
      return res.status(404).send('Not found');
    }
    try {
      await pool.query('SELECT 1');
      const required = [
        'users','profiles','prospects','submarkets','requirements','market_comps',
        'touches','contact_interactions','broker_skills','skill_activities'
      ];
      const { rows } = await pool.query(
        `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'`
      );
      const present = new Set(rows.map((r: any) => r.tablename));
      const missing = required.filter(t => !present.has(t));
      res.json({ ok: true, missing, present: Array.from(present) });
    } catch (err: any) {
      res.status(500).json({ ok: false, message: err.message });
    }
  });

  app.get('/api/skill-activities', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const limitRaw = (req.query.limit as string) || '';
      const limit = Math.max(1, Math.min(1500, Number.parseInt(limitRaw || '0') || 0)) || 50;
      if (isDemo(req)) {
        const [prospects, interactions, requirements, comps] = await Promise.all([
          demo.getProspects(userId),
          demo.getInteractions(userId),
          demo.getRequirements(userId),
          demo.getMarketComps(userId),
        ]);

        const interactionActivities = (interactions || []).map((i: any) => {
          const interactionType = (i.type === 'call' || i.type === 'email' || i.type === 'meeting') ? i.type : 'note';
          const action = (interactionType === 'note') ? 'note_added' : actionForInteractionType(interactionType);
          const xp = xpForInteractionType(interactionType);
          return {
            id: i.id,
            userId,
            skillType: 'followUp',
            action,
            xpGained: xp,
            timestamp: new Date(i.date || i.createdAt || Date.now()),
            relatedId: i.prospectId,
            multiplier: 1,
          };
        });

        const prospectActivities = (prospects || []).map((p: any) => ({
          id: p.id,
          userId,
          skillType: 'prospecting',
          action: 'add_prospect',
          xpGained: XP_VALUES.PROSPECTING,
          timestamp: new Date(p.createdAt || p.createdDate || Date.now()),
          relatedId: p.id,
          multiplier: 1,
        }));

        const requirementActivities = (requirements || []).map((r: any) => ({
          id: r.id,
          userId,
          skillType: 'marketKnowledge',
          action: 'add_requirement',
          xpGained: XP_VALUES.REQUIREMENT,
          timestamp: new Date(r.createdAt || Date.now()),
          relatedId: r.id,
          multiplier: 1,
        }));

        const compActivities = (comps || []).map((c: any) => ({
          id: c.id,
          userId,
          skillType: 'marketKnowledge',
          action: 'add_market_comp',
          xpGained: XP_VALUES.MARKET_COMP,
          timestamp: new Date(c.createdAt || Date.now()),
          relatedId: c.id,
          multiplier: 1,
        }));

        const activities = [
          ...interactionActivities,
          ...prospectActivities,
          ...requirementActivities,
          ...compActivities,
        ]
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, limit);

        return res.json(activities);
      }
      const activities = await storage.getSkillActivities(userId, limit);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching skill activities:', error);
      res.status(500).json({ message: 'Failed to fetch skill activities' });
    }
  });

  app.post('/api/skill-activities', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const email = (req as any)?.user?.email || null;
      if (!isDemo(req)) {
        await ensureUser(userId, email);
      }
      const activityData = {
        userId,
        skillType: req.body.skillType,
        action: req.body.action,
        xpGained: req.body.xpGained,
        relatedId: req.body.relatedId || null,
        multiplier: req.body.multiplier || 1
      };
      if (isDemo(req)) {
        return res.json({ id: randomUUID(), ...activityData, timestamp: new Date().toISOString() });
      }

      const activity = await storage.addSkillActivity(activityData);
      res.json(activity);
    } catch (error) {
      console.error('Error adding skill activity:', error);
      res.status(500).json({ message: 'Failed to add skill activity' });
    }
  });

  app.get('/api/leaderboard', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const { orgId } = req.query;

      // Demo mode: synthesize a simple all-time leaderboard for two demo users
      if (isDemo(req)) {
        const demoUserId = 'demo-user';
        const rivalUserId = 'demo-user-2';

        // Ensure profiles exist
        const [demoProfile, rivalProfile] = await Promise.all([
          demo.getProfile(demoUserId),
          demo.getProfile(rivalUserId)
        ]);
        if (!demoProfile) {
          await demo.setProfile(demoUserId, { id: demoUserId, name: 'Demo User' });
        }
        if (!rivalProfile) {
          await demo.setProfile(rivalUserId, { id: rivalUserId, name: 'Teammate Two' });
        }

        // Seed minimal data for rival if empty
        const [rPros, rInts, rReqs, rComps] = await Promise.all([
          demo.getProspects(rivalUserId),
          demo.getInteractions(rivalUserId),
          demo.getRequirements(rivalUserId),
          demo.getMarketComps(rivalUserId),
        ]);
        if ((rPros?.length || 0) === 0 && (rInts?.length || 0) === 0 && (rReqs?.length || 0) === 0 && (rComps?.length || 0) === 0) {
          // Create a few seed items
          const now = Date.now();
          // Prospects
          for (let i = 0; i < 3; i++) {
            await demo.addProspect(rivalUserId, { id: `${rivalUserId}-p${i}`, name: `Rival Prospect ${i+1}`, createdAt: new Date(now - i*86400000).toISOString() });
          }
          // Interactions
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i1`, type: 'call', date: new Date(now - 3*86400000).toISOString() });
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i2`, type: 'email', date: new Date(now - 2*86400000).toISOString() });
          await demo.addInteraction(rivalUserId, { id: `${rivalUserId}-i3`, type: 'meeting', date: new Date(now - 1*86400000).toISOString() });
          // Requirements
          await demo.addRequirement(rivalUserId, { id: `${rivalUserId}-r1`, title: 'Tenant need 5k sf', createdAt: new Date(now - 4*86400000).toISOString() });
          await demo.addRequirement(rivalUserId, { id: `${rivalUserId}-r2`, title: 'Buyer search 2 acres', createdAt: new Date(now - 1*86400000).toISOString() });
          // Market comp
          await demo.addMarketComp(rivalUserId, { id: `${rivalUserId}-c1`, address: '123 Main St', createdAt: new Date(now - 5*86400000).toISOString() });
        }

        // Compute XP similar to skills endpoint
        // Match client level logic (L = floor(sqrt(xp/100)))
        const levelFromXp = (xp: number) => Math.min(99, Math.floor(Math.sqrt(xp / 100)));

        async function compute(user: string) {
          const [prospects, interactions, requirements, comps] = await Promise.all([
            demo.getProspects(user),
            demo.getInteractions(user),
            demo.getRequirements(user),
            demo.getMarketComps(user),
          ]);
          const prospectingXp = (prospects?.length || 0) * XP_VALUES.PROSPECTING;
          const followUpXp = (interactions || []).reduce((sum: number, i: any) => {
            if (i.type === 'call' || i.type === 'email' || i.type === 'meeting') {
              return sum + xpForInteractionType(i.type);
            }
            return sum + XP_VALUES.FOLLOW_UP_BASE; // note/other
          }, 0);
          const marketKnowledgeXp = ((requirements?.length || 0) + (comps?.length || 0)) * XP_VALUES.REQUIREMENT;
          // Consistency XP per distinct active day
          const daysSet = new Set(
            (interactions || []).map((i: any) => new Date(i.date || i.createdAt).toDateString())
          );
          const streakDays = daysSet.size > 0 ? Math.min(daysSet.size, 99) : 0;
          const consistencyXp = streakDays * XP_VALUES.CONSISTENCY;
          const level =
            levelFromXp(prospectingXp) +
            levelFromXp(followUpXp) +
            levelFromXp(consistencyXp) +
            levelFromXp(marketKnowledgeXp);
          return { prospectingXp, followUpXp, marketKnowledgeXp, consistencyXp, level };
        }

        const [demoStats, rivalStats, demoName, rivalName] = await Promise.all([
          compute(demoUserId),
          compute(rivalUserId),
          demo.getProfile(demoUserId).then(p => p?.name || 'Demo User'),
          demo.getProfile(rivalUserId).then(p => p?.name || 'Teammate Two'),
        ]);

        const data = [
          {
            user_id: demoUserId,
            user_email: 'demo@example.com',
            display_name: demoName,
            level_total: demoStats.level,
            xp_total: demoStats.prospectingXp + demoStats.followUpXp,
          },
          {
            user_id: rivalUserId,
            user_email: 'teammate@example.com',
            display_name: rivalName,
            level_total: rivalStats.level,
            xp_total: rivalStats.prospectingXp + rivalStats.followUpXp,
          },
        ].sort((a, b) => (b.level_total - a.level_total) || (b.xp_total - a.xp_total));

        return res.json({ data });
      }

      const leaderboard = await storage.getLeaderboard({
        userId,
        orgId: orgId as string,
        since: undefined,
      });

      res.json({ data: leaderboard });
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
