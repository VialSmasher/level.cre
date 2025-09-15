import type { Express, RequestHandler } from "express";
export declare function getSession(): any;
export declare function setupAuth(app: Express): Promise<void>;
export declare const isAuthenticated: RequestHandler;
