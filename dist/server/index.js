"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = require("path");
const routes_1 = require("./routes");
const replitAuth_1 = require("./replitAuth");
const app = (0, express_1.default)();
const port = parseInt(process.env.PORT || '5000', 10);
app.use(express_1.default.json());
// Initialize server
async function startServer() {
    // Setup authentication
    await (0, replitAuth_1.setupAuth)(app);
    app.use(routes_1.default);
    // Development mode - Vite integration
    if (process.env.NODE_ENV !== 'production') {
        try {
            const { createServer } = await Promise.resolve().then(() => require('vite'));
            const vite = await createServer({
                server: { middlewareMode: true },
                appType: 'spa',
                root: './client'
            });
            app.use(vite.ssrFixStacktrace);
            app.use(vite.middlewares);
        }
        catch (error) {
            console.log('Vite not available, serving in production mode');
            // Fallback to production mode
            app.use(express_1.default.static('client/dist'));
            app.get('*', (req, res) => {
                res.sendFile(path_1.default.resolve('./client/dist/index.html'));
            });
        }
    }
    else {
        // Production mode - serve static files from client build
        app.use(express_1.default.static('client/dist'));
        app.get('*', (req, res) => {
            res.sendFile(path_1.default.resolve('./client/dist/index.html'));
        });
    }
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running at http://0.0.0.0:${port}`);
    });
}
startServer().catch(console.error);
