import { User, UpsertUser } from '../shared/schema';

export interface IStorage {
  // User operations
  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  // Other operations for demo purposes
  getUsers(): Promise<User[]>;
  deleteUser(id: string): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: User[] = [];

  // (IMPORTANT) these user operations are mandatory for Replit Auth.
  async getUser(id: string): Promise<User | undefined> {
    return this.users.find(user => user.id === id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const userId = userData.id || `user_${Date.now()}`;
    const existingIndex = this.users.findIndex(user => user.id === userId);
    const now = new Date();
    
    if (existingIndex >= 0) {
      // Update existing user
      const updatedUser: User = {
        ...this.users[existingIndex],
        email: userData.email ?? this.users[existingIndex].email,
        firstName: userData.firstName ?? this.users[existingIndex].firstName,
        lastName: userData.lastName ?? this.users[existingIndex].lastName,
        profileImageUrl: userData.profileImageUrl ?? this.users[existingIndex].profileImageUrl,
        updatedAt: now,
      };
      this.users[existingIndex] = updatedUser;
      return updatedUser;
    } else {
      // Create new user
      const newUser: User = {
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
  async getUsers(): Promise<User[]> {
    return [...this.users];
  }

  async deleteUser(id: string): Promise<boolean> {
    const index = this.users.findIndex(user => user.id === id);
    if (index === -1) return false;
    
    this.users.splice(index, 1);
    return true;
  }
}

export const storage = new MemStorage();