import { User, UpsertUser } from '../shared/schema';
export interface IStorage {
    getUser(id: string): Promise<User | undefined>;
    upsertUser(user: UpsertUser): Promise<User>;
    getUsers(): Promise<User[]>;
    deleteUser(id: string): Promise<boolean>;
}
export declare class MemStorage implements IStorage {
    private users;
    getUser(id: string): Promise<User | undefined>;
    upsertUser(userData: UpsertUser): Promise<User>;
    getUsers(): Promise<User[]>;
    deleteUser(id: string): Promise<boolean>;
}
export declare const storage: MemStorage;
