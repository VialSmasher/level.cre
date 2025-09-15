"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storage = exports.MemStorage = void 0;
class MemStorage {
    constructor() {
        this.users = [];
    }
    // (IMPORTANT) these user operations are mandatory for Replit Auth.
    async getUser(id) {
        return this.users.find(user => user.id === id);
    }
    async upsertUser(userData) {
        const userId = userData.id || `user_${Date.now()}`;
        const existingIndex = this.users.findIndex(user => user.id === userId);
        const now = new Date();
        if (existingIndex >= 0) {
            // Update existing user
            const updatedUser = {
                ...this.users[existingIndex],
                email: userData.email ?? this.users[existingIndex].email,
                firstName: userData.firstName ?? this.users[existingIndex].firstName,
                lastName: userData.lastName ?? this.users[existingIndex].lastName,
                profileImageUrl: userData.profileImageUrl ?? this.users[existingIndex].profileImageUrl,
                updatedAt: now,
            };
            this.users[existingIndex] = updatedUser;
            return updatedUser;
        }
        else {
            // Create new user
            const newUser = {
                id: userId,
                email: userData.email ?? null,
                firstName: userData.firstName ?? null,
                lastName: userData.lastName ?? null,
                profileImageUrl: userData.profileImageUrl ?? null,
                createdAt: now,
                updatedAt: now,
            };
            this.users.push(newUser);
            return newUser;
        }
    }
    // Other operations for demo purposes
    async getUsers() {
        return [...this.users];
    }
    async deleteUser(id) {
        const index = this.users.findIndex(user => user.id === id);
        if (index === -1)
            return false;
        this.users.splice(index, 1);
        return true;
    }
}
exports.MemStorage = MemStorage;
exports.storage = new MemStorage();
