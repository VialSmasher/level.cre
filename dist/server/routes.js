"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const storage_1 = require("./storage");
const schema_1 = require("../shared/schema");
const replitAuth_1 = require("./replitAuth");
const router = (0, express_1.Router)();
// Auth routes
router.get('/api/auth/user', replitAuth_1.isAuthenticated, async (req, res) => {
    try {
        const userId = req.user.claims.sub;
        const user = await storage_1.storage.getUser(userId);
        res.json(user);
    }
    catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).json({ message: "Failed to fetch user" });
    }
});
// Users endpoints
router.get('/api/users', async (req, res) => {
    try {
        const users = await storage_1.storage.getUsers();
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
router.get('/api/users/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const user = await storage_1.storage.getUser(id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});
router.post('/api/users', async (req, res) => {
    try {
        const userData = schema_1.insertUserSchema.parse(req.body);
        const user = await storage_1.storage.upsertUser(userData);
        res.status(201).json(user);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        res.status(500).json({ error: 'Failed to create user' });
    }
});
router.patch('/api/users/:id', async (req, res) => {
    try {
        const id = req.params.id;
        // Get existing user first
        const existingUser = await storage_1.storage.getUser(id);
        if (!existingUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        const userData = schema_1.insertUserSchema.partial().parse(req.body);
        const user = await storage_1.storage.upsertUser({ ...existingUser, ...userData });
        res.json(user);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid user data', details: error.errors });
        }
        res.status(500).json({ error: 'Failed to update user' });
    }
});
router.delete('/api/users/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const deleted = await storage_1.storage.deleteUser(id);
        if (!deleted) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(204).send();
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to delete user' });
    }
});
exports.default = router;
