"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const routes_1 = __importDefault(require("./routes"));
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
            const { createServer } = await Promise.resolve().then(() => __importStar(require('vite')));
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
