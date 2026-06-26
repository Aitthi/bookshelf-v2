# Baseline Test Results (Phase 0 oracle)

Recorded on branch `port/typescript-v2`, before any TypeScript port.
Command: `pnpm test` (mocha `--check-leaks -t 10000 -b`), Node v22.22.0.

## Summary
- **732 passing** (sqlite `:memory:` dialect — the runnable baseline)
- **6 pending**
- **1 failing** — `Integration Tests > Dialect: mysql > "before all" hook`: `AggregateError [ECONNREFUSED]`. **Environmental only** (no MySQL server running; requires `docker-compose up`). NOT a code defect. The postgres/mysql dialects need DB containers; sqlite is the parity oracle.

## Environment note
- `sqlite3@5.1.7` ships node-gyp 8.4.1 which cannot build on Node 22. Fixed for baseline by rebuilding the native binding with `node-gyp@latest` (`PYTHON=python3 npx node-gyp@latest rebuild` inside `node_modules/sqlite3`). The TS port updates/replaces this in later phases.

## Parity rule for Phases 3–6
The ported Vitest suite must reproduce the **732 sqlite passes** (same describe blocks). mysql/pg parity is verified separately when DB containers are available.

## Full passing test list
See `baseline-test-list.txt` (sibling file) for the complete ✔ test-name dump.
