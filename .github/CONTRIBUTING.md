# How to Contribute to bookshelfv2

bookshelfv2 is a full TypeScript rewrite of the original [Bookshelf.js](https://github.com/bookshelf/bookshelf),
published to npm as [`@assetsart/bookshelf`](https://www.npmjs.com/package/@assetsart/bookshelf) with zero runtime
dependencies. Contributions are welcome — please read the notes below before opening an issue or pull request.

* Before sending a pull request for a feature or bug fix, be sure to add or update
  [tests](https://github.com/Aitthi/bookshelf-v2/tree/main/test).
* Code style is enforced by [Biome](https://biomejs.dev/). Run `pnpm format` to auto-format and `pnpm lint` to check
  before committing — CI fails on lint errors.
* Fill in the issue or pull request templates when creating your entry. This helps clarify the scope of your proposal
  or the subject of your issue.
* All pull requests should target the `main` branch.

## Development Environment Setup

You'll need `git`, [Node.js](https://nodejs.org/) **>= 20.12**, and [pnpm](https://pnpm.io/) **9**. (The published
library runs on Node >= 16, but the dev/test toolchain — Vitest 4 — requires Node >= 20.12.)

Begin by forking the [main repository](https://github.com/Aitthi/bookshelf-v2) and cloning your fork:

```sh
git clone git@github.com:yourusername/bookshelf-v2.git
cd bookshelf-v2
```

Install the dependencies with pnpm:

```sh
pnpm install
```

The only thing left is the databases used by the integration tests. The unit tests and SQLite3 integration tests
(`:memory:`) need no setup; only the MySQL and PostgreSQL integration tests require running servers.

There are two options for setting these up:

* Use Docker containers for the database servers (recommended — explained below).
* Provide and configure the database servers manually (also explained further down).

### Using Docker Containers

After installing [Docker](https://docs.docker.com/engine/install/) with the Compose plugin, run the following command
at the root of your cloned repository:

```sh
# Start the test databases (MySQL + PostgreSQL)
docker compose up -d
```

Tear them down with:

```sh
docker compose down --remove-orphans
```

The containers expose MySQL on `3306` (empty root password) and PostgreSQL on `5432` (`trust` auth), each with a
database named `bookshelf_test` — matching the connection defaults in `test/integration/helpers/config.ts`. The tests
reset DB state on each run, so you can run them many times against the same instances.

### Manual Database Servers Setup

If you prefer not to use Docker, set the servers up to match the defaults in `test/integration/helpers/config.ts`:

* **MySQL** — reachable on `localhost:3306`, connect as user `root` with **no password**, database `bookshelf_test`.
* **PostgreSQL** — reachable on `localhost:5432`, connect as user `postgres` with **no password**, database
  `bookshelf_test`.

#### MySQL

Install [MySQL](https://www.mysql.com/) via your package manager (e.g. `sudo apt-get install mysql-server mysql-client`
on Ubuntu, or [homebrew](https://brew.sh/) on macOS). The test suite needs to connect as `root` without a password.
Verify with:

```sh
mysql -u root
```

If you get `ERROR 1045 (28000): Access denied`, set an empty password for `root` (MySQL 5.7+):

```sql
USE mysql;
UPDATE user SET authentication_string = "" WHERE User = "root";
FLUSH PRIVILEGES;
QUIT;
```

> Do not use a passwordless root account in production — this is for the local test environment only.

#### PostgreSQL

Install [PostgreSQL](https://www.postgresql.org/) via your package manager (e.g.
`sudo apt-get install postgresql postgresql-client` on Ubuntu, or [Postgres.app](https://postgresapp.com/) on macOS).
The test suite connects as `postgres` on localhost without a password. Add the following line to your `pg_hba.conf` to
trust local connections, then restart the server:

```
host    all             all             127.0.0.1/32            trust
```

> The `trust` setting disables password checks for local clients — do not use it in production.

#### Database Creation

Create the `bookshelf_test` database on each server (not needed when using Docker, which creates it automatically):

```sql
CREATE DATABASE bookshelf_test;
```

## Running the Checks

Mirror what CI runs (CI runs the full matrix on Node 20, 22, and 24):

```sh
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome lint
pnpm test          # vitest run (unit + integration)
pnpm test:types    # build + typecheck the dual ESM/CJS type fixtures
pnpm attw          # build + @arethetypeswrong/cli — validates the published types
pnpm smoke         # build + dual ESM/CJS runtime smoke test
```

Always make sure every check passes before sending a pull request.

## Publishing a New Release

Releases are automated by `.github/workflows/release.yml`, which publishes `@assetsart/bookshelf` to npm with
provenance when a `v*` tag is pushed. **The release workflow does not gate on CI**, so a maintainer must ensure CI is
green on `main` before tagging. The order is:

1. Merge the change to `main` and wait for CI to go green.
2. Bump the version on `main` — use the script, do **not** hand-edit:

   ```sh
   node scripts/release-bump.mjs 2.1.0
   ```

   It atomically bumps both `package.json` `version` and `src/version.ts` `VERSION` (the runtime `orm.VERSION`
   constant) and verifies they agree, so a release can't ship a mismatched pair.
3. Update `CHANGELOG.md`, then commit: `git commit -am "chore(release): 2.1.0"`.
4. Tag the release commit on `main` and push:

   ```sh
   git tag -a v2.1.0 -m "bookshelfv2 2.1.0"
   git push origin main
   git push origin v2.1.0   # triggers release.yml
   ```

The workflow runs `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, and the dual ESM/CJS smoke test before
publishing — if any fails, nothing is published. A prerelease version (containing `-`, e.g. `2.1.0-beta`) publishes
under the `next` dist-tag instead of `latest`.
