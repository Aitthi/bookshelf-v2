# bookshelfv2 — TypeScript Port, Zero-Deps, Plugin-Ready

**สถานะ:** Design — revised หลัง adversarial subagent review (C1–C4, B1–B5 resolved)
**วันที่:** 2026-06-26
**Topic:** Port `re-bookshelf` ORM → `bookshelfv2` (TypeScript strict, zero runtime deps, ESM+CJS, plugin-ready)

---

## 1. เป้าหมาย & ขอบเขต

Port `re-bookshelf` (fork ของ Bookshelf.js ORM, ~6,366 บรรทัด ใน `lib/`) ให้กลายเป็น library ที่:

1. เขียนด้วย **TypeScript** ทั้งหมด, `strict: true`, มี `.d.ts` คุณภาพสูงให้ consumer
2. **Zero runtime dependencies** — ถอด `bluebird`, `lodash`, `inflection`, `create-error` ออกทั้งหมด
3. Build **dual ESM + CJS** ด้วย **SWC** (transpile) + **tsc** (types/typecheck)
4. คง **public API เดิม** — เป็น drop-in replacement (พฤติกรรมและชื่อ method ไม่เปลี่ยน)
5. วาง infrastructure สำหรับ **bundled opt-in plugins** ที่ tree-shakeable
6. **Lightweight** ที่สุด — ลบไฟล์/toolchain ที่ไม่ใช้

**ชื่อ package:** `bookshelfv2`
**Peer dependency เดียว:** `knex` (`>=3.1.0`) — เหมือนเดิม

### Non-goals (YAGNI)
- ไม่ปรับ public API / ไม่ modernize signature (ยังรองรับ callback patterns เดิม)
- ไม่เพิ่ม dialect ใหม่
- ไม่ rewrite logic ของ ORM — port แบบ behaviour-preserving เท่านั้น

---

## 2. สถาปัตยกรรมเป้าหมาย

```
src/
  index.ts                 # entry — export factory `bookshelfv2(knex)` + named exports
  constants.ts
  errors.ts                # native Error subclasses (แทน create-error)
  extend.ts                # prototype-based extend helper
  helpers.ts
  sync.ts
  eager.ts
  relation.ts
  collection.ts
  model.ts
  bookshelf.ts             # factory ที่ประกอบทุกอย่างเข้าด้วยกัน
  base/                    # framework-agnostic base classes (คงโครงเดิม)
    events.ts
    model.ts
    collection.ts
    relation.ts
    eager.ts
  internal/                # ★ แทน runtime dependencies (เป็น zero-dep core)
    promise.ts             # bind/map/reduce/props/method/try แทน bluebird
    lang.ts                # utility ที่ใช้จริง แทน lodash
    inflection.ts          # pluralize/singularize/camelize/underscored แทน inflection
  plugins/                 # ★ bundled opt-in plugins (แต่ละไฟล์อิสระ tree-shakeable)
    virtuals.ts
    case-converter.ts
    (เพิ่มเติมตามต้องการในอนาคต)

dist/
  esm/    # SWC output, module: es6     (+ package.json {"type":"module"})
  cjs/    # SWC output, module: commonjs (+ package.json {"type":"commonjs"})
  types/  # tsc --emitDeclarationOnly
```

**หลักการ:** การแยก `base/` (framework-agnostic, Backbone-style) ออกจาก layer ที่รู้จัก knex ยังคงเดิม เพื่อรักษาขอบเขตความรับผิดชอบที่ชัดเจนของโค้ดต้นฉบับ

---

## 3. การถอด runtime dependencies (zero-dep core)

ทุกอย่างย้ายไป `src/internal/` เขียนเป็น TypeScript native และ port เฉพาะส่วนที่ใช้จริง

### 3.1 `bluebird` → `internal/promise.ts` (จุดเสี่ยงสูงสุด)

#### Promise return-type strategy (decision — ดู §10 ADR)
Public async methods (`save`, `fetch`, `fetchAll`, `fetchPage`, `destroy`, `count`, `load`, ...) เดิมคืน **bluebird Promise** และทั้ง consumer และ doc examples ใน repo เรียก method เฉพาะของ bluebird บน return value:
- `.tap()` — 17 จุดใน `lib/` + ปรากฏใน public doc (`bookshelf.js:367`, `collection.js:323`, `base/model.js:980`)
- `.return()/.thenReturn()` — 13 จุด
- `.bind()`, `.map()`, `.spread()`, `.asCallback()/.nodeify()`

เพื่อคง public API จริง (drop-in replacement) จะสร้าง **custom `BPromise` subclass ของ native `Promise`** ใน `internal/promise.ts` ที่ผูก instance methods กลับเข้าไป: `.tap()`, `.bind()`, `.map()`, `.reduce()`, `.return()/.thenReturn()`, `.spread()`, `.asCallback()/.nodeify()`, `.finally()` (native มีแล้ว) โดยทุก method คืน `BPromise` ต่อเนื่อง (chainable) — ยัง **zero runtime dep**

#### Static helpers ที่ต้องมี (exhaustive inventory — gate ก่อน Phase 3)
ตรวจกับโค้ดจริง — helper ที่ **ใช้จริง**:
- `BPromise.bind(ctx)` — เริ่ม chain ที่ผูก `this` (ใช้กว้าง: `sync.ts`, `model.ts`, `collection.ts`, `base/collection.ts`)
- `BPromise.map(items, iterator)` — **concurrent (default Infinity)**; ไม่พบการส่ง `{concurrency}` ในโค้ดจริง → **ไม่ต้องทำ concurrency limit** (`base/collection.js:355`, `eager.js:99`)
- `BPromise.mapSeries(items, iterator)` — **sequential เรียงลำดับ** (`base/events.js:101` `triggerThen`) ⚠️ semantic ต่างจาก `map` ห้ามแทนด้วย `Promise.all(map(...))`
- `BPromise.reduce(items, iterator, initial)` (`base/collection.js:407`)
- `BPromise.join(p1, p2, ..., handler)` (`helpers.js:110` `fetchPage`)
- `BPromise.method(fn)` — wrap: sync throw → rejected, preserve `this`/`arguments`, คืน `BPromise`
- `BPromise.try(fn)` (`Promise.try`)
- `BPromise.resolve/reject/all` — คืน `BPromise`; `BPromise.reject(msg)` แทน `Promise.rejected` (`base/collection.js:411`)
- **ตัดออก:** `Promise.props` — *ไม่ถูกใช้จริงใน `lib/`* (spec รอบแรกระบุเกิน)

#### `Promise.bind(this)` refactor (mechanical pass)
จุดเสี่ยงพังเงียบ: chain ที่ผสม non-arrow callback ซึ่งพึ่ง bound `this` (`sync.ts:77-202`, `model.ts:1056/1158/1284`) `BPromise.bind(ctx)` + `.bind()` (reset) จะ preserve pattern นี้ได้โดยตรง — ลด refactor risk แทนการแปลงเป็น `const self = this` ทุกจุด ต้องมี integration test ครอบทุก fetch/save/count/select path เทียบ baseline

ตำแหน่งที่กระทบ (จาก grep): `bookshelf.ts`, `base/events.ts`, `sync.ts`, `base/collection.ts`, `relation.ts`, `collection.ts`, `model.ts`, `eager.ts`, `helpers.ts`, `base/eager.ts`, `base/model.ts`

### 3.2 `lodash` → `internal/lang.ts`
ใช้แทบทุกไฟล์. **Deliverable Phase 2 = exhaustive inventory** (grep ทุก `_.x` call site) ก่อนเขียน คาดว่า ~30-40 ฟังก์ชัน รวมที่ reviewer พบเพิ่ม:
`isFunction, isString, isObject, isPlainObject, isEmpty, isEqual, isNil, clone, cloneDeep, assign/assignIn/extend, defaultsDeep, pick, omit, omitBy, keys, values, has, get, result, each/forEach, map, flatMap, reduce, filter, reject, find, remove, groupBy, uniq, flatten, compact, difference, intersection, invokeMap, once, bind, head/first, last, isArray (→ Array.isArray)`

**⚠️ จุดที่ flat-function port ไม่พอ — ต้อง rewrite call site หรือทำ chain wrapper + iteratee shorthand:**
- `sync.ts:133` — `_(knex._statements).filter({grouping:'columns'}).some('value.length')` — lodash **chain** + object-predicate shorthand `{grouping:'columns'}` + string-path shorthand `'value.length'`
- `relation.ts:370` — `_.reject(_(response).map(key).uniq().value(), _.isNil)` — chain + iteratee
- `base/collection.ts:648` — `_(this)...` chain

แนวทาง: rewrite 3 จุดนี้เป็น native imperative (ไม่ build chain engine ทั้งระบบ) แต่ละฟังก์ชันเขียน native + unit test ตรง use case จริง

### 3.3 `inflection` → `internal/inflection.ts`
ใช้เฉพาะ `relation.ts` (เดา table/relation names). port เฉพาะ verb ที่ใช้จริง: น่าจะเป็น `pluralize`, `singularize`, `camelize`, `underscore`, `capitalize`

### 3.4 `create-error` → `errors.ts`
เปลี่ยน `createError('NotFoundError')` เป็น native subclass:
```ts
export class NotFoundError extends Error { constructor(m?: string){ super(m); this.name = 'NotFoundError' } }
```
คง named exports เดิม: `NotFoundError`, `EmptyError`, `NoRowsUpdatedError`, `NoRowsDeletedError`, `ModelNotResolvedError`
ตั้ง `Error.captureStackTrace` ถ้ามี และ set prototype ให้ `instanceof` ทำงานข้าม transpile target

---

## 4. Plugin model (bundled opt-in)

`bookshelf.plugin()` ยังรับ `function | function[]` เหมือนเดิม. การ "เปลี่ยนแค่ชื่อตอน import":

```ts
import bookshelfv2 from 'bookshelfv2'
import virtuals from 'bookshelfv2/plugins/virtuals'   // ★ opt-in import

const orm = bookshelfv2(knex)
orm.plugin(virtuals)        // ส่ง function เข้าไปตรงๆ
```

- Plugins ทั้งหมดอยู่ใน package แต่ **ไม่โหลดอัตโนมัติ** — consumer ที่ไม่ import = bundler ตัดทิ้ง (tree-shakeable)
- ผ่าน `exports` map: `"./plugins/*": { import: "./dist/esm/plugins/*.js", require: "./dist/cjs/plugins/*.js", types: "./dist/types/plugins/*.d.ts" }`
- **String-form เดิม** (`plugin('pagination'|'visibility'|'registry'|...)`) คง warning message เดิมไว้เป๊ะ เพื่อ backward compat
- Plugin signature เดิม: `(bookshelf, options?) => void` คงไว้ → plugin ภายนอกที่เขียนแบบเดิมยังใช้ได้

**Plugins ชุดแรกที่ bundle:** `virtuals`, `case-converter` (port กลับมาจาก upstream ที่เคยถอด) — เป็นตัวพิสูจน์ infrastructure. ตัวอื่นเพิ่มภายหลังด้วย pattern เดียวกัน

---

## 5. Build & tooling

### Transpile: SWC
- `@swc/cli` + `@swc/core`, config ใน `.swcrc`
- `build:esm` → `swc src -d dist/esm` (module: es6)
- `build:cjs` → `swc src -d dist/cjs` (module: commonjs)
- เขียน `dist/esm/package.json` = `{"type":"module"}` และ `dist/cjs/package.json` = `{"type":"commonjs"}` (script เล็กๆ หลัง build)
- **ไม่ bundle** → output mirror `src/` → plugins tree-shakeable โดยธรรมชาติ

### Types: tsc
- `build:types` → `tsc --emitDeclarationOnly --outDir dist/types`
- `typecheck` → `tsc --noEmit` (เป็น gate ก่อน test/CI)
- **`.d.ts` quality (review B5):** `extend.ts` (Backbone-style dynamic `Object.assign(Child, Parent, staticProps)` + `__super__`) ทำให้ tsc auto-emit ออกมา `any`-heavy เพราะ `Model`/`Collection` ทุกตัวสืบจาก pattern นี้ → public surface หลักจะใช้ **curated hand-written `.d.ts` / typed generic interface** สำหรับ `Model`/`Collection`/`bookshelfv2()` factory แทนการพึ่ง emit ล้วน ยอม `any` เฉพาะ internal extend plumbing (มี comment กำกับ)

### package.json `exports`
```jsonc
{
  "name": "bookshelfv2",
  "type": "module",
  "exports": {
    ".":            { "types": "./dist/types/index.d.ts", "import": "./dist/esm/index.js", "require": "./dist/cjs/index.js" },
    "./plugins/*":  { "types": "./dist/types/plugins/*.d.ts", "import": "./dist/esm/plugins/*.js", "require": "./dist/cjs/plugins/*.js" }
  },
  "peerDependencies": { "knex": ">=3.1.0" }
}
```

**หมายเหตุ consumer (จาก review B2):** subpath wildcard `"./plugins/*"` + type resolution ต้องใช้ `moduleResolution: "node16" | "nodenext" | "bundler"` (classic `"node"` จะไม่เห็น types ของ `bookshelfv2/plugins/*`) — ระบุใน README ว่าต้องการ Node >=16 และ bundler รุ่นที่รองรับ exports (webpack >=5, vite, esbuild, modern jest)

### Test: Vitest
- แทน mocha/chai/sinon/nyc ทั้งชุด
- port test ที่มีอยู่เป็น TS: unit (`bookshelf, collection, events, sync, model`) + integration (`relations, relation, json, model, plugin, collection`)
- integration ใช้ sqlite `:memory:` เหมือนเดิม; pg/mysql เป็น optional ผ่าน `docker-compose.yml`
- coverage ผ่าน `vitest --coverage` (v8 provider)
- **Unhandled-rejection fidelity (review B4):** test เดิม (`test/index.js:8-11`) ใช้ `Promise.longStackTraces()` + `onPossiblyUnhandledRejection(err => throw)` ทำให้ rejection ที่ไม่ถูก handle โยน error ดังๆ ต้อง config Vitest setup ให้ **rethrow unhandled rejection** ชัดเจน ไม่งั้น test ที่เคย fail ดังๆ อาจ pass เงียบ → baseline (Phase 0) เทียบ Vitest (Phase 4) ไม่ใช่ apples-to-apples

### CI: GitHub Actions
- แทน `.travis.yml` ด้วย workflow ใน `.github/workflows/` : typecheck + lint + test (matrix node 18/20/22) + build smoke test

### Lint + Format
- **Biome** (`biome.json`) — Rust binary ตัวเดียวแทนทั้ง ESLint + Prettier; เร็ว, ตัด devDeps หลายตัว, ไม่มีข้อจำกัด Node engine (ต่างจาก eslint 10 ที่ตัด Node 18). ลบ `.eslintrc.json`/`.prettierrc` เดิม. scripts: `lint`/`format`/`check`

---

## 6. Cleanup ไฟล์

**ลบ:**
- `.travis.yml` (Travis เลิกใช้ → GitHub Actions)
- `.istanbul.yml`, `.nycrc.yml` (nyc → vitest coverage)
- `docs/*.html` + `docs/scripts` + `docs/styles` + `docs/images` (generated jsdoc output)
- `scripts/jsdoc.sh`, `scripts/jsdoc.config.json`, `scripts/postpublish.sh` (jsdoc toolchain)
- `bookshelf-jsdoc-theme` devDependency
- `bookshelf.js` (CJS entry เดิม → แทนด้วย `exports` map)

**แปลง:**
- `tutorials/*` (jsdoc tutorials) → markdown ใน `docs/` (associations, events, many-to-many, models, one-to-many, one-to-one, parse-and-format, polymorphic)

**คงไว้:**
- `docker-compose.yml` (เล็ก, ใช้ทดสอบ pg/mysql dialect)
- `LICENSE`, `README.md` (อัปเดตชื่อ/ตัวอย่างเป็น bookshelfv2), `CHANGELOG.md`
- `.github/*.md` templates, `.prettierrc`, `.gitignore`, `CNAME`

---

## 7. แผนการ execute (bottom-up, behaviour-preserving)

แต่ละ phase จบด้วย gate: **`tsc --noEmit` ผ่าน + Vitest เขียว + build ได้**

- **Phase 0 — Baseline:** รัน mocha test ชุดเดิมให้ผ่าน (สร้าง reference ที่รู้ว่าถูก) บันทึกผล
- **Phase 1 — Tooling:** เพิ่ม TypeScript, `.swcrc`, tsconfig (strict, `allowJs` ชั่วคราว), Vitest, scripts, eslint flat config, GitHub Actions
  - **Interim entry (review B3):** **ยังไม่** สลับ `package.json` ไป exports map ที่ชี้ `dist/` และ **ยังไม่ลบ** `bookshelf.js` entry จนกว่า dual build เสร็จ (Phase 6) — ระหว่าง Phase 1–5 ให้ `main`/test ชี้ source ที่รันได้ (`.js`/`.ts` ผ่าน vitest+swc register) เพื่อให้ baseline oracle รันได้ตลอด เปลี่ยนชื่อเป็น `bookshelfv2` + exports map เป็นขั้นตอนใน Phase 6
- **Phase 2 — Internal utils (TS):** สร้าง `internal/promise.ts` (`BPromise` subclass + static helpers ตาม §3.1), `internal/lang.ts`, `internal/inflection.ts` + unit test แต่ละฟังก์ชัน; เขียน `errors.ts` ใหม่
  - **Gate ก่อนเข้า Phase 3:** ทำ exhaustive inventory ของทุก bluebird method + ทุก `_.` call site (grep ทั้ง `lib/`) ให้ครบ และ `BPromise`/`lang` cover ครบทุกตัวที่ใช้ — ไม่งั้น per-module port จะเจอ helper ขาดกลางทาง
- **Phase 3 — Port bottom-up:** เปลี่ยน .js → .ts ทีละ module พร้อมสลับ deps→internal และเติม types เต็ม strict ตามลำดับ:
  `constants → errors → extend → helpers → base/events → base/relation → base/eager → base/collection → base/model → sync → eager → relation → collection → model → bookshelf → index`
  แต่ละ module: port + typecheck ผ่าน + test ที่เกี่ยวข้องเขียว
- **Phase 4 — Test migration:** ย้าย test ทั้งหมดเป็น Vitest/TS, ลบ mocha/chai/sinon/nyc, integration เขียวบน sqlite
- **Phase 5 — Plugin infra:** สร้าง `plugins/virtuals.ts`, `plugins/case-converter.ts` + exports subpath + test การ import แบบ opt-in
- **Phase 6 — Cleanup & docs:** ลบไฟล์ตาม §6, แปลง tutorials→markdown, อัปเดต README, verify dual build (import ESM + require CJS จริง), verify `.d.ts`, ตรวจ `node_modules` ของ consumer = zero runtime dep

---

## 8. Verification strategy

- **Per-module:** `tsc --noEmit` + Vitest subset เขียว
- **Per-phase gate:** typecheck + full Vitest (unit+integration sqlite) + `swc` build สำเร็จ
- **Final acceptance:**
  1. `import` (ESM) และ `require` (CJS) ใช้งานได้จริงในโปรเจกต์ทดสอบแยก
  2. `.d.ts` ครบและ consumer ได้ type ที่ถูกต้อง
  3. opt-in plugin import ทำงาน + tree-shaking ตัด plugin ที่ไม่ import
  4. `package.json` มี `dependencies: {}` (zero runtime deps), peer = knex เท่านั้น
  5. พฤติกรรม API เทียบเท่า baseline (Phase 0) — test ชุดเดียวกันผ่าน
  6. `model.save().tap(...)` / `.return()` / `.bind()` ตาม public doc ยังทำงาน (compat test ของ `BPromise`)
  7. `triggerThen` event handler รันเรียงลำดับ (mapSeries semantic คงไว้)

---

## 10. ADR: Promise strategy (custom `BPromise` subclass)

**Context:** bluebird แทรกอยู่ทั้ง internal chain และ **public return surface** — consumer + doc ใช้ `.tap/.bind/.map/.return/.spread/.asCallback` การคืน native Promise ล้วนเป็น breaking change ที่ขัดเป้า "คง public API เดิม"

**Decision:** สร้าง `class BPromise<T> extends Promise<T>` ใน `internal/promise.ts` ผูก instance methods (`tap, bind, map, reduce, return/thenReturn, spread, asCallback/nodeify`) + static helpers (`bind, map, mapSeries, reduce, join, method, try, resolve, reject, all`) ทุก method คืน `BPromise` (chainable) — **zero runtime dep** (subclass native เท่านั้น)

**Consequences:**
- ✅ drop-in จริง consumer code เดิมไม่พัง; doc examples ยัง valid
- ✅ คุม semantic เอง (`map` concurrent vs `mapSeries` sequential) ชัดเจน
- ⚠️ น้ำหนักเพิ่มเล็กน้อย (ไฟล์เดียว ~ไม่กี่ร้อยบรรทัด) — ยอมรับได้เทียบกับ bluebird ทั้ง package
- ⚠️ ต้องระวัง subclass-of-Promise corner case (`.then` ต้องคืน `BPromise`, `Symbol.species`) — cover ด้วย unit test
- ทางเลือกที่ปฏิเสธ: native+breaking (ขัดเป้า), native+minimal (surface ไม่พอ เสี่ยง consumer พังบาง method)

---

## 9. ความเสี่ยง & การลดความเสี่ยง

| ความเสี่ยง | ผลกระทบ | การลด |
|---|---|---|
| Public promise return type เปลี่ยน (`.tap/.bind/.map/.return/.spread/.asCallback`) | **breaking, consumer พังทันที** | สร้าง custom `BPromise` subclass คง method ครบ (§3.1, ADR §10) |
| `mapSeries` (sequential) ถูกแทนด้วย concurrent `map` โดยพลาด | event/validation chain เพี้ยนเงียบ | inventory แยก `map` vs `mapSeries` ชัดเจน; test `triggerThen` ลำดับ side-effect |
| `Promise.bind(this)` semantics เพี้ยนตอนถอด bluebird | บั๊ก context ใน chain (เงียบ, หายาก) | `BPromise.bind(ctx)` preserve pattern เดิม; integration test ครอบ fetch/save/count/select |
| lodash chain + iteratee shorthand (`sync.ts:133`, `relation.ts:370`, `base/collection.ts:648`) | บั๊กพฤติกรรม | exhaustive inventory ก่อน port; rewrite 3 call site เป็น native imperative + unit test |
| dynamic `extend`/mixin กับ strict TS → `.d.ts` `any`-heavy | type คุณภาพต่ำ (ขัดเป้า) | curated hand-written `.d.ts` overlay สำหรับ Model/Collection/factory (review B5) |
| dual ESM/CJS `instanceof Model/Collection` (`helpers.ts:25`, `relation.ts`, `base/collection.ts`) | consumer ที่โหลด 2 format → identity คนละตัว พังเงียบ | guarantee single core instance; smoke test ทั้งสอง format; เลี่ยง instanceof ข้าม boundary ที่ทำได้ (review B1) |
| Vitest unhandled-rejection contract ต่างจาก bluebird test | regression ที่เคย fail กลับ pass เงียบ | config Vitest rethrow unhandled rejection ใน setup (review B4) |
| Interim entry พังระหว่าง migration | baseline oracle รันไม่ได้ | คง `bookshelf.js` entry + main ชี้ source จน Phase 6 (review B3) |
| behaviour drift ระหว่าง port | regression | Phase 0 baseline เป็น oracle; ห้าม merge ถ้า test เดิม fail |
