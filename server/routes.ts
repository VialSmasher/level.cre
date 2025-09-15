import { Router } from 'express';
import { z } from 'zod';
import { storage } from './storage';
import { insertUserSchema } from '../shared/schema';
import { isAuthenticated } from './replitAuth';

const router = Router();

// Auth routes
router.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUser(userId);
    res.json(user);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

// Users endpoints
router.get('/api/users', async (req, res) => {
  try {
    const users = await storage.getUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/api/users', async (req, res) => {
  try {
    const userData = insertUserSchema.parse(req.body);
    const user = await storage.upsertUser(userData);
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid user data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

router.patch('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    // Get existing user first
    const existingUser = await storage.getUser(id);
    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userData = insertUserSchema.partial().parse(req.body);
    const user = await storage.upsertUser({ ...existingUser, ...userData });
    
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid user data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update user' });
  }
});

router.delete('/api/users/:id', async (req, res) => {
  try {
    const id = req.params.id;
    
    const deleted = await storage.deleteUser(id);
    if (!deleted) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;