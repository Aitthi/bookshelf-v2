import { writeFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

mkdirSync('dist/esm', { recursive: true });
mkdirSync('dist/cjs', { recursive: true });
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
console.log('wrote dist/{esm,cjs}/package.json type markers');

// Rewrite extensionless relative imports/exports in dist/esm so that Node ESM
// module resolution works without --experimental-specifier-resolution=node.
// Matches:  from './foo'  from '../bar/baz'  import('./qux')
// Skips paths that already have an extension or are bare specifiers.
const RELATIVE_IMPORT_RE = /(from\s+['"]|import\(['"])(\.\.?\/[^'"]+?)(['")\s])/g;

function addJsExt(path) {
  // Already has an extension
  if (/\.[a-z]+$/i.test(path)) return path;
  return path + '.js';
}

function fixFile(filePath) {
  const src = readFileSync(filePath, 'utf8');
  const fixed = src.replace(RELATIVE_IMPORT_RE, (_, prefix, path, suffix) => {
    return prefix + addJsExt(path) + suffix;
  });
  if (fixed !== src) writeFileSync(filePath, fixed);
}

function walkDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkDir(full);
    } else if (full.endsWith('.js')) {
      fixFile(full);
    }
  }
}

walkDir('dist/esm');
console.log('fixed ESM import extensions in dist/esm');
