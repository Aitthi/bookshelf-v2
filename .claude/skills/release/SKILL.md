---
name: release
description: Cut a bookshelfv2 npm release. Use when the user asks to release, publish, cut a version, or tag a release of this project. Enforces the order PR → green CI → merge to main → bump on main → tag ON MAIN (never tag a feature branch), and watches the publish.
---

# Releasing bookshelfv2

`release.yml` publishes the single `bookshelfv2` npm package on a `v*` tag (pure
TypeScript, dual ESM/CJS — no native platform matrix). It **does NOT gate on
CI** — a red `ci.yml` still publishes once a tag is pushed. So YOU are the gate:
never tag until CI is green on main.

## The order (do NOT deviate)

```
1. Push branch        → 2. Open PR (→ main)   → 3. WAIT for CI to go GREEN
→ 4. Merge PR to main → 5. Bump version on main → 6. Tag vX.Y.Z ON MAIN → push tag
→ 7. Watch release.yml to success
```

**Never tag a feature branch.** The tag must point at the merged commit on `main`
— the publish builds from the tagged commit.

## 1–2. Pre-flight gates + PR

Mirror `ci.yml` EXACTLY before opening the PR (so CI won't surprise you):
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm smoke          # build + dual ESM/CJS smoke
```
Then: `git push origin <branch>` and `gh pr create --base main --head <branch> …`.

> CI test matrix runs Node **20/22/24** (Vitest 4 needs node:util `styleText`,
> Node ≥20.12). The published library itself targets Node ≥16 (ES2022 dist).

## 3. Wait for CI — GREEN before merge

```bash
gh pr checks <pr#> --watch          # or: gh run watch <run-id> --exit-status
```
Do not proceed until every check passes. If red, fix on the branch and repeat.

## 4. Merge to main

```bash
gh pr merge <pr#> --merge --delete-branch     # or --squash, per repo convention
git checkout main && git pull origin main
```

## 5. Bump version ON MAIN — use the script (do NOT hand-edit)

`scripts/release-bump.mjs` bumps **both** version refs atomically and VERIFIES,
so a release can't ship a mismatched pair:
```bash
node scripts/release-bump.mjs 2.1.0       # set the NEW version
# → "✓ bumped 2/2 refs to 2.1.0"  (exits non-zero + writes nothing if a ref is missing)
git commit -am "chore(release): 2.1.0"
```
The 2 refs: root `package.json` `version` + `src/version.ts` `VERSION` (the value
baked into the runtime; the script regenerates it via `gen-version.mjs`).

> **Why a script, not `sed`:** the runtime `VERSION` (exposed as `orm.VERSION`)
> is generated from `package.json` at build time. Bumping only `package.json`
> while a stale `src/version.ts` is committed would ship a wrong `VERSION`
> constant. The script bumps both and verifies they agree before you can tag.

## 6. Tag on main + push

```bash
git tag -a v2.1.0 -m "bookshelfv2 2.1.0 — <summary>"
git push origin main          # the bump commit
git push origin v2.1.0        # ← triggers release.yml
```
Shortcut once CI is green on main: `node scripts/release-bump.mjs 2.1.0 --release`
does the bump + `chore(release)` commit + tag + push in one step (refuses to run
off `main`). Use the explicit steps above when you want to inspect the bump first.

## 7. Watch the publish

```bash
gh run watch $(gh run list --workflow=release.yml --limit 1 --json databaseId --jq '.[0].databaseId') --exit-status
```

## release.yml notes (footguns)

- **Prerelease** (version has `-`, e.g. `2.1.0-beta`) → published under the `next`
  dist-tag, NOT `latest`, so it never clobbers the stable release users get by
  default. **Stable** (no `-`) → normal `latest`.
- Publishes with `--provenance` (needs `id-token: write`, already set) — npm shows
  a verified provenance badge linking the tarball to this workflow + commit.
- The workflow runs `pnpm typecheck && pnpm test`, `pnpm build`, and the dual
  ESM/CJS smoke before publishing — if any fails, nothing is published.
- `workflow_dispatch` (Actions → release → Run workflow) runs the build + a
  `npm publish --dry-run` WITHOUT publishing — use it to validate package
  contents (the `files: ["dist"]` allowlist) before the first real `vX.Y.Z` tag.
- **One-time secret:** an `NPM_TOKEN` repo secret (npm automation/granular token
  with publish rights to `bookshelfv2`). Without it, publish fails at auth.
- `package.json` ships only `dist` (the `files` allowlist) + README + LICENSE +
  package.json. `pnpm.onlyBuiltDependencies` lets CI build native devDeps
  (sqlite3 etc.) under `--frozen-lockfile`; the published package has zero
  runtime deps.
