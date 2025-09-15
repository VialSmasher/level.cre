import express from 'express';
import { createServer } from 'vite';
import routes from './routes';

const app = express();
const port = parseInt(process.env.PORT || '5000', 10);

app.use(express.json());
app.use(routes);

// Development mode - Vite integration
if (process.env.NODE_ENV !== 'production') {
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'spa'
  });
  app.use(vite.ssrFixStacktrace);
  app.use(vite.middlewares);
} else {
  // Production mode - serve static files
  app.use(express.static('dist'));
  app.get('*', (req, res) => {
    res.sendFile('index.html', { root: 'dist' });
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${port}`);
});