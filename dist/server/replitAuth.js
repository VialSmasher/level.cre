"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthenticated = void 0;
exports.getSession = getSession;
exports.setupAuth = setupAuth;
const passport_1 = require("passport");
const express_session_1 = require("express-session");
function getSession() {
    const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
    return (0, express_session_1.default)({
        secret: process.env.SESSION_SECRET || 'dev-secret-key',
        resave: false,
        saveUninitialized: false,
        cookie: {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: sessionTtl,
        },
    });
}
async function setupAuth(app) {
    app.set("trust proxy", 1);
    app.use(getSession());
    app.use(passport_1.default.initialize());
    app.use(passport_1.default.session());
    passport_1.default.serializeUser((user, cb) => cb(null, user));
    passport_1.default.deserializeUser((user, cb) => cb(null, user));
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
const isAuthenticated = async (req, res, next) => {
    if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    return next();
};
exports.isAuthenticated = isAuthenticated;
