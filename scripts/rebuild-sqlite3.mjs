// Workaround: sqlite3@5.1.7 bundles node-gyp 8.4.1 which cannot build on Node 22.
// pnpm install/add re-triggers the failing build and clobbers the native binary,
// breaking the mocha baseline oracle. Re-run this after any pnpm install/add until
// the dep-update phase replaces/upgrades sqlite3.
//   pnpm fix:sqlite3
import { execSync } from 'node:child_process';
execSync('npx -y node-gyp@latest rebuild', {
  cwd: 'node_modules/sqlite3',
  stdio: 'inherit',
  env: { ...process.env, PYTHON: process.env.PYTHON || 'python3' }
});
console.log('sqlite3 native binding rebuilt');
