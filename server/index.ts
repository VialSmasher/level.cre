import express from 'express';
import { createServer } from 'vite';
import path from 'path';
import routes from './routes';

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

app.use(express.json());
app.use(routes);

// Development mode - Vite integration
if (process.env.NODE_ENV !== 'production') {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa',
    root: './client'
  });
  app.use(vite.ssrFixStacktrace);
  app.use(vite.middlewares);
} else {
  // Production mode - serve static files from client build
  app.use(express.static('client/dist'));
  app.get('*', (req, res) => {
    res.sendFile(path.resolve('./client/dist/index.html'));
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});