#!/usr/bin/env node
/**
 * scripts/release-bump.mjs — atomically bump the bookshelfv2 version, regenerate
 * the embedded version, then VERIFY, so a release can never ship a mismatched
 * version pair.
 *
 * bookshelfv2 is a SINGLE package (unlike brust's 15 native refs): the only
 * sources of truth are
 *   - package.json  `version`
 *   - src/version.ts `VERSION`  (the value baked into the runtime via gen-version)
 * src/version.ts is generated from package.json, so this script bumps the root
 * version, re-runs gen-version, and verifies the two agree before allowing a tag.
 *
 * Usage:
 *   node scripts/release-bump.mjs 2.1.0            # bump + verify only
 *   node scripts/release-bump.mjs 2.1.0 --release  # + git commit, tag, push (triggers release.yml) — main only
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const NEW = process.argv[2];
const RELEASE = process.argv.includes('--release');

if (!NEW || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(NEW)) {
  console.error('usage: node scripts/release-bump.mjs <new-version> [--release]');
  console.error('  e.g. node scripts/release-bump.mjs 2.1.0');
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'package.json');
const VERSION_TS = join(ROOT, 'src/version.ts');
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: 'pipe' }).toString().trim();

// ── Bump package.json `version` (targeted edit, preserve formatting) ──────────
let pkgText = readFileSync(PKG, 'utf8');
const re = /("version"\s*:\s*")([^"]*)(")/;
const m = pkgText.match(re);
if (!m) {
  console.error('✗ package.json: "version" key not found — aborting, nothing written');
  process.exit(1);
}
const OLD = m[2];
pkgText = pkgText.replace(re, `$1${NEW}$3`);
writeFileSync(PKG, pkgText);

// ── Regenerate src/version.ts from the new package.json version ───────────────
run('node', ['scripts/gen-version.mjs']);

// ── Verify both refs agree, independently of how the edit was made ────────────
const pkgVersion = JSON.parse(readFileSync(PKG, 'utf8')).version;
const tsMatch = readFileSync(VERSION_TS, 'utf8').match(/VERSION\s*=\s*'([^']*)'/);
const tsVersion = tsMatch ? tsMatch[1] : null;

const problems = [];
if (pkgVersion !== NEW) problems.push(`  package.json version: expected ${NEW}, got ${pkgVersion}`);
if (tsVersion !== NEW) problems.push(`  src/version.ts VERSION: expected ${NEW}, got ${tsVersion}`);
if (problems.length > 0) {
  console.error('✗ verification FAILED');
  for (const p of problems) console.error(p);
  process.exit(1);
}

console.log(`✓ bumped 2/2 refs to ${NEW}${OLD === NEW ? ' (was already at target)' : ` (from ${OLD})`}`);
console.log('  package.json version + src/version.ts VERSION');

// ── Optional release ──────────────────────────────────────────────────────────
if (!RELEASE) {
  console.log('\nnext (or re-run with --release):');
  console.log(`  git commit -am "chore(release): ${NEW}"`);
  console.log(`  git tag -a v${NEW} -m "bookshelfv2 ${NEW}"`);
  console.log(`  git push origin HEAD && git push origin v${NEW}`);
  process.exit(0);
}

const branch = run('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
if (branch !== 'main') {
  console.error(`✗ --release refuses to run off main (on "${branch}"). Tag the merged main commit.`);
  process.exit(1);
}
console.log(`\nreleasing v${NEW} on main …`);
run('git', ['add', 'package.json', 'src/version.ts']);
run('git', ['commit', '-m', `chore(release): ${NEW}\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`]);
run('git', ['tag', '-a', `v${NEW}`, '-m', `bookshelfv2 ${NEW}`]);
run('git', ['push', 'origin', 'HEAD']);
run('git', ['push', 'origin', `v${NEW}`]);
console.log(`✓ pushed v${NEW} — release.yml will build and publish to npm`);
