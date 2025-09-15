const { execSync } = require('child_process');

try {
  console.log('Building TypeScript server...');
  execSync('npx tsc --project tsconfig.node.json', { stdio: 'inherit' });
  
  console.log('Building frontend...');
  execSync('npx vite build', { stdio: 'inherit', cwd: 'client' });
  
  console.log('Build completed successfully!');
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
}