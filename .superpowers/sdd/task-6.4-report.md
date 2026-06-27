# Task 6.4 + 6.5 Report

**Status:** Complete
**Commit:** pending (see below)
**Files deleted:** 38 (3 CI/coverage configs, 3 jsdoc scripts, 22 jsdoc HTML + CNAME, 8 docs/images+scripts+styles assets, 1 tutorials/tutorials.json)
**devDeps removed:** `bookshelf-jsdoc-theme`, `jsdoc` (edited package.json directly; `pnpm remove` failed due to pre-existing sqlite3/Python-3.14 build issue)
**Tutorials moved:** 8 content guides → `docs/guides/` + `tutorials/index.md` → `docs/guides/README.md`; no `require('bookshelf')`/`require('re-bookshelf')` or string-form `bookshelf.plugin('...')` calls found in any guide — no import-name updates needed
**package.json reference check:** `grep -nE "jsdoc|istanbul|nyc|travis" package.json` → 0 hits
**typecheck:** exit 0
**tests:** 499 passed / 6 skipped (sqlite3 bindings needed `pnpm fix:sqlite3` — pre-existing issue triggered by pnpm lockfile churn, not our changes)
**lint:** 58 warnings / 10 infos, exit 0 (pre-existing biome warnings, no errors)
**Concerns:** sqlite3 rebuild fails via `pnpm remove` on Python 3.14 (distutils removed); `pnpm fix:sqlite3` resolves it. Pre-existing condition, not introduced here.
**Report path:** `/Users/detoro/code/bookshelf-v2/.superpowers/sdd/task-6.4-report.md`
