import type { Express } from "express";
import { createServer, type Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { getUserId, requireAuth } from "./auth";
import { z } from 'zod';
import { ProspectGeometry, ProspectStatus, FollowUpTimeframe } from '@shared/schema';
import { createClient } from '@supabase/supabase-js';
import { pool } from './db';

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Supabase client for server-side OAuth
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
  const supabase = (supabaseUrl && supabaseKey) 
    ? createClient(supabaseUrl, supabaseKey)
    : null;

  // Simple redirect to Google OAuth - let Supabase handle everything
  app.get('/api/auth/google', async (req, res) => {
    if (!supabase) {
      return res.status(500).json({ error: 'Supabase not configured' });
    }
    
    // Ensure HTTPS for Replit domains (both .replit.app and .replit.dev)
    const host = req.get('host') || '';
    const protocol = (host.includes('replit.app') || host.includes('replit.dev')) ? 'https' : req.protocol;
    const redirectUrl = `${protocol}://${req.get('host')}/app`;
    
    console.log('OAuth Debug - Host:', req.get('host'));
    console.log('OAuth Debug - Protocol:', protocol);
    console.log('OAuth Debug - Redirect URL:', redirectUrl);
    
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl
      }
    });
    
    if (error) {
      console.error('OAuth initiation error:', error);
      return res.redirect(`/?error=${encodeURIComponent(error.message)}`);
    }
    
    console.log('OAuth Debug - Generated URL:', data.url);
    
    if (data.url) {
      res.redirect(data.url);
    } else {
      res.redirect('/?error=no_oauth_url');
    }
  });

  // OAuth callback endpoint that Supabase/Google expects
  app.get('/api/auth/callback', async (req, res) => {
    console.log('OAuth Callback - Query params:', req.query);
    console.log('OAuth Callback - Headers:', req.headers);
    
    // Handle OAuth callback - redirect to app
    const { code, error: authError } = req.query;
    
    if (authError) {
      console.error('OAuth callback error:', authError);
      return res.redirect(`/?error=${encodeURIComponent(authError as string)}`);
    }
    
    // Redirect to app - let the client handle the token exchange
    res.redirect('/app');
  });

  // Removed stateful session endpoint (stateless auth only)

  // Logout endpoint (stateless) – nothing to clear server-side
  app.post('/api/auth/logout', async (_req, res) => {
    res.json({ success: true });
  });
  // User endpoint - returns demo user for unauthenticated requests, real user for authenticated requests
  app.get('/api/auth/user', async (req, res) => {
    // Check if this is an authenticated request with JWT token
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.slice(7);
        const decoded = jwt.decode(token) as any;
        
        if (decoded && decoded.sub) {
          // Return user info from JWT token
          const user = {
            id: decoded.sub,
            email: decoded.email,
            firstName: decoded.user_metadata?.full_name?.split(' ')[0] || 'User',
            lastName: decoded.user_metadata?.full_name?.split(' ').slice(1).join(' ') || '',
            profileImageUrl: decoded.user_metadata?.avatar_url || null,
            createdAt: new Date(decoded.created_at || Date.now()),
            updatedAt: new Date(),
          };
          return res.json(user);
        }
      } catch (error) {
        console.error('Error decoding JWT:', error);
      }
    }
    
    // Fall back to demo user and ensure the row exists for FK constraints
    try {
      const demoUser = await storage.upsertUser({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
      });
      res.json({
        id: demoUser.id,
        email: demoUser.email,
        firstName: demoUser.firstName || 'Demo',
        lastName: demoUser.lastName || 'User',
        profileImageUrl: demoUser.profileImageUrl || null,
        createdAt: demoUser.createdAt || new Date(),
        updatedAt: demoUser.updatedAt || new Date(),
      });
    } catch (e) {
      console.error('Error ensuring demo user exists:', e);
      res.status(500).json({ message: 'Failed to load demo user' });
    }
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
  // Profile routes
  app.get('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = await storage.getProfile(userId);
      res.json(profile);
    } catch (error) {
      console.error("Error fetching profile:", error);
      res.status(500).json({ message: "Failed to fetch profile" });
    }
  });

  app.post('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      console.log("Creating profile for user:", userId);
      console.log("Profile data:", req.body);
      
      const profileData = {
        id: userId,
        ...req.body
      };
      const profile = await storage.createProfile(profileData);
      console.log("Profile created successfully:", profile);
      res.json(profile);
    } catch (error: any) {
      console.error("Error creating profile:", error);
      console.error("Stack trace:", error?.stack);
      res.status(500).json({ message: "Failed to create profile" });
    }
  });

  app.patch('/api/profile', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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

  // Prospects routes with user association
  app.get('/api/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const prospects = await storage.getAllProspects(userId);
      res.json(prospects);
    } catch (error) {
      console.error("Error fetching prospects:", error);
      res.status(500).json({ message: "Failed to fetch prospects" });
    }
  });

  app.post('/api/prospects', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      // Validate payload to match client shape (uses GeoJSON geometry)
      const ProspectInputSchema = z.object({
        name: z.string().min(1),
        status: ProspectStatus.default('prospect'),
        notes: z.string().optional().default(''),
        geometry: ProspectGeometry,
        submarketId: z.string().optional(),
        lastContactDate: z.string().optional(),
        followUpTimeframe: FollowUpTimeframe.optional(),
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

      const prospect = await storage.createProspect({ ...parseResult.data, userId });
      res.status(201).json(prospect);
    } catch (e) {
      if (e instanceof Error) {
        console.error('Error creating prospect:', e.message, e.stack);
        res.status(500).json({ message: 'Failed to create prospect', error: e.message });
      } else {
        console.error('Error creating prospect:', e);
        res.status(500).json({ message: 'Failed to create prospect', error: String(e) });
      }
    }
  });

  app.patch('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const prospect = await storage.updateProspect(req.params.id, userId, req.body);
      if (!prospect) {
        return res.status(404).json({ message: "Prospect not found" });
      }
      res.json(prospect);
    } catch (error) {
      console.error("Error updating prospect:", error);
      res.status(500).json({ message: "Failed to update prospect" });
    }
  });

  app.delete('/api/prospects/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
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
      const interactionData = {
        userId,
        prospectId: req.body.prospectId,
        date: req.body.date,
        type: req.body.type,
        outcome: req.body.outcome,
        notes: req.body.notes || '',
        nextFollowUp: req.body.nextFollowUp || null
      };
      
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
  app.get('/api/skills', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const skills = await storage.getBrokerSkills(userId);
      res.json(skills);
    } catch (error) {
      console.error('Error fetching broker skills:', error);
      res.status(500).json({ message: 'Failed to fetch broker skills' });
    }
  });

  // Diagnostics: check DB connectivity and required tables
  app.get('/api/_diag/db', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      const required = [
        'users','profiles','prospects','submarkets','requirements',
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
      const activities = await storage.getSkillActivities(userId);
      res.json(activities);
    } catch (error) {
      console.error('Error fetching skill activities:', error);
      res.status(500).json({ message: 'Failed to fetch skill activities' });
    }
  });

  app.post('/api/skill-activities', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const activityData = {
        userId,
        skillType: req.body.skillType,
        action: req.body.action,
        xpGained: req.body.xpGained,
        relatedId: req.body.relatedId || null,
        multiplier: req.body.multiplier || 1
      };
      
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
      const { orgId, since } = req.query;
      
      // Parse since parameter if provided
      let sinceDate: Date | undefined;
      if (since && typeof since === 'string') {
        sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
          return res.status(400).json({ error: 'Invalid since parameter' });
        }
      }

      const leaderboard = await storage.getLeaderboard({
        userId,
        orgId: orgId as string,
        since: sinceDate
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
