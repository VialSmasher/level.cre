import type { Express } from "express";
import { createServer, type Server } from "http";
import jwt from "jsonwebtoken";
import { storage } from "./storage";
import { getUserId, requireAuth } from "./auth";
import { createClient } from '@supabase/supabase-js';

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
    
    // Ensure HTTPS for production domains
    const protocol = req.get('host')?.includes('replit.app') ? 'https' : req.protocol;
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

  // Get current authenticated user
  app.get('/api/auth/session', async (req, res) => {
    const session = (req.session as any)?.supabaseSession;
    const userId = (req.session as any)?.userId;
    
    if (session && userId) {
      try {
        const user = await storage.getUser(userId);
        if (user) {
          res.json({ user, session });
        } else {
          res.status(404).json({ error: 'User not found' });
        }
      } catch (error) {
        res.status(500).json({ error: 'Failed to get user' });
      }
    } else {
      res.status(401).json({ error: 'Not authenticated' });
    }
  });

  // Logout endpoint
  app.post('/api/auth/logout', async (req, res) => {
    req.session = req.session || {};
    delete (req.session as any).supabaseSession;
    delete (req.session as any).userId;
    
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
    
    // Fall back to demo user
    const demoUser = {
      id: 'demo-user',
      email: 'demo@example.com',
      firstName: 'Demo',
      lastName: 'User',
      profileImageUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    res.json(demoUser);
  });

  // Demo bypass route for testing
  app.post('/api/auth/demo', async (req, res) => {
    try {
      const demoUser = await storage.upsertUser({
        id: 'demo-user',
        email: 'demo@example.com',
        firstName: 'Demo',
        lastName: 'User',
        profileImageUrl: null,
      });
      
      // Create a demo session
      req.session = req.session || {};
      (req.session as any).demoUser = demoUser;
      
      res.json(demoUser);
    } catch (error) {
      console.error("Error creating demo user:", error);
      res.status(500).json({ message: "Failed to create demo user" });
    }
  });

  // Check demo auth status
  app.get('/api/auth/demo/user', async (req, res) => {
    const demoUser = (req.session as any)?.demoUser;
    if (demoUser) {
      res.json(demoUser);
    } else {
      res.status(401).json({ message: "Not authenticated" });
    }
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

      // First, ensure the user record exists in the users table
      await storage.upsertUser({
        id: userId,
        email: req.body.email || undefined,
        firstName: req.body.firstName || undefined,
        lastName: req.body.lastName || undefined,
        profileImageUrl: req.body.profileImageUrl || undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      console.log("User record ensured for:", userId);
      
      const profileData = {
        id: userId,
        ...req.body
      };
      const profile = await storage.createProfile(profileData);
      console.log("Profile created successfully:", profile);

      // Create default submarkets in database for new user
      console.log("Creating default submarkets for user:", userId);
      await storage.createDefaultSubmarkets(userId);
      console.log("Default submarkets created successfully");
      
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
      
      // Ensure user record exists before creating requirement
      await storage.upsertUser({
        id: userId,
        email: req.body.email || undefined,
        firstName: undefined,
        lastName: undefined,
        profileImageUrl: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
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

  // Comps routes with user association
  app.get('/api/comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const comps = await storage.getAllComps(userId);
      res.json(comps);
    } catch (error) {
      console.error("Error fetching comps:", error);
      res.status(500).json({ message: "Failed to fetch comps" });
    }
  });

  app.post('/api/comps', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      
      // Ensure user record exists before creating comp
      await storage.upsertUser({
        id: userId,
        email: req.body.email || undefined,
        firstName: undefined,
        lastName: undefined,
        profileImageUrl: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const comp = await storage.createComp({
        ...req.body,
        userId
      });
      res.status(201).json(comp);
    } catch (error) {
      console.error("Error creating comp:", error);
      res.status(500).json({ message: "Failed to create comp" });
    }
  });

  app.patch('/api/comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const comp = await storage.updateComp(req.params.id, userId, req.body);
      if (!comp) {
        return res.status(404).json({ message: "Comp not found" });
      }
      res.json(comp);
    } catch (error) {
      console.error("Error updating comp:", error);
      res.status(500).json({ message: "Failed to update comp" });
    }
  });

  app.delete('/api/comps/:id', requireAuth, async (req, res) => {
    try {
      const userId = getUserId(req);
      const deleted = await storage.deleteComp(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "Comp not found" });
      }
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting comp:", error);
      res.status(500).json({ message: "Failed to delete comp" });
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
      
      // Ensure user record exists before creating prospect
      await storage.upsertUser({
        id: userId,
        email: req.body.email || undefined,
        firstName: undefined,
        lastName: undefined,
        profileImageUrl: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      const prospect = await storage.createProspect({
        ...req.body,
        userId
      });
      res.status(201).json(prospect);
    } catch (error) {
      console.error("Error creating prospect:", error);
      res.status(500).json({ message: "Failed to create prospect" });
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
      const { orgId } = req.query;

      const leaderboard = await storage.getLeaderboard({
        userId,
        orgId: orgId as string
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
