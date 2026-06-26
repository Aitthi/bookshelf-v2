import { writeFileSync, mkdirSync } from 'node:fs';
mkdirSync('dist/esm', { recursive: true });
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
console.log('wrote dist/{esm,cjs}/package.json type markers');
