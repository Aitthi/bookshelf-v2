import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const srcTypes = join(root, 'src/types');
const distTypes = join(root, 'dist/types');

if (!existsSync(srcTypes)) {
  console.error('copy-types: src/types not found');
  process.exit(1);
}
mkdirSync(distTypes, { recursive: true });
// Overlay hand-written declarations on top of tsc-emitted internal types.
cpSync(srcTypes, distTypes, { recursive: true });
console.log('copy-types: overlaid src/types -> dist/types');
