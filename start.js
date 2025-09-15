const { spawn } = require('child_process');

// Start the server with tsx
const server = spawn('npx', ['tsx', 'server/index.ts'], { 
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'development', PORT: '5000' }
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
  process.exit(code);
});