#!/usr/bin/env node
// Development script for npm run dev functionality
const { spawn } = require('child_process');

console.log('Starting development server...');

const server = spawn('tsx', ['server/index.ts'], {
  stdio: 'inherit',
  env: { 
    ...process.env, 
    NODE_ENV: 'development', 
    PORT: '5000' 
  }
});

server.on('error', (err) => {
  console.error('Failed to start development server:', err);
  process.exit(1);
});

server.on('close', (code) => {
  console.log(`Development server exited with code ${code}`);
  process.exit(code);
});