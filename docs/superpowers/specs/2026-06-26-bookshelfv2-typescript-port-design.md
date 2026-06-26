# bookshelfv2 — TypeScript Port, Zero-Deps, Plugin-Ready

**สถานะ:** Design (approved verbally, pending written review)
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

### 3.1 `bluebird` → `internal/promise.ts`
**จุดเสี่ยงสูงสุด.** โค้ดเดิมพึ่ง pattern เฉพาะของ bluebird:
- `Promise.bind(this).then(...)` — ผูก `this` context ให้ทุก callback ถัดไปใน chain
- `Promise.map`, `Promise.reduce`, `Promise.props`, `Promise.method`, `Promise.try`
- `.thenReturn()`, `.bind()`

แนวทาง: เขียน helper บน native `Promise` + closure capture `this` แทนการพึ่ง `Promise.bind`:
- `pmap(items, iterator, {concurrency?})` — รองรับ concurrency limit (bluebird ใช้)
- `preduce(items, iterator, initial)`
- `pprops(obj)` — เทียบ `Promise.props`
- `pmethod` / `ptry` — wrap function ให้ return promise และจับ sync throw
- จุดที่ใช้ `Promise.bind(this)` จะ refactor เป็น arrow function / ตัวแปร `const self = this` เพื่อคง context

ตำแหน่งที่กระทบ (จาก grep): `bookshelf.ts`, `base/events.ts`, `sync.ts`, `base/collection.ts`, `relation.ts`, `collection.ts`, `model.ts`, `eager.ts`, `helpers.ts`, `base/eager.ts`, `base/model.ts`

### 3.2 `lodash` → `internal/lang.ts`
ใช้แทบทุกไฟล์. port เฉพาะฟังก์ชันที่ใช้จริง (ตรวจรายการจริงระหว่าง port) — คาดว่า ~25-35 ฟังก์ชัน เช่น:
`isFunction, isString, isObject, isEmpty, isEqual, clone, cloneDeep, assign/extend, pick, omit, keys, values, has, get, each/forEach, map, reduce, filter, find, groupBy, uniq, flatten, compact, difference, intersection, invokeMap, head/first, last, isArray (→ Array.isArray)`

แต่ละฟังก์ชันเขียน native + unit test ตรงพฤติกรรมที่โค้ดต้องการ (ไม่ต้อง implement edge case ที่ lodash มีแต่เราไม่ใช้)

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

### Test: Vitest
- แทน mocha/chai/sinon/nyc ทั้งชุด
- port test ที่มีอยู่เป็น TS: unit (`bookshelf, collection, events, sync, model`) + integration (`relations, relation, json, model, plugin, collection`)
- integration ใช้ sqlite `:memory:` เหมือนเดิม; pg/mysql เป็น optional ผ่าน `docker-compose.yml`
- coverage ผ่าน `vitest --coverage` (v8 provider)

### CI: GitHub Actions
- แทน `.travis.yml` ด้วย workflow ใน `.github/workflows/` : typecheck + lint + test (matrix node 18/20/22) + build smoke test

### Lint
- ESLint flat config (`eslint.config.js`) + `@typescript-eslint` + prettier; ลบ `.eslintrc.json` เดิม

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
- **Phase 1 — Tooling:** เพิ่ม TypeScript, `.swcrc`, tsconfig (strict, `allowJs` ชั่วคราว), Vitest, package.json (ชื่อ `bookshelfv2` + exports + scripts), eslint flat config, GitHub Actions
- **Phase 2 — Internal utils (TS):** สร้าง `internal/promise.ts`, `internal/lang.ts`, `internal/inflection.ts` + unit test แต่ละฟังก์ชัน; เขียน `errors.ts` ใหม่
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

---

## 9. ความเสี่ยง & การลดความเสี่ยง

| ความเสี่ยง | ผลกระทบ | การลด |
|---|---|---|
| `Promise.bind(this)` semantics เพี้ยนตอนถอด bluebird | บั๊ก context ใน chain (เงียบ, หายาก) | port ทีละจุด + test integration เทียบ baseline; เขียน helper ที่ test แยก |
| lodash edge cases ที่เราพลาด | บั๊กพฤติกรรม | port เฉพาะที่ใช้ + unit test ตรง use case จริง; cross-ref จุดเรียกทุกที่ |
| dynamic `extend`/mixin กับ strict TS | type ยาก/`any` หลุด | ใช้ generics + typed mixin pattern; ยอม `any` เฉพาะจุด extend ที่ dynamic จริง (มี comment) |
| dual ESM/CJS interop (`instanceof`, default export) | consumer พัง | smoke test ทั้งสอง format ใน Phase 6 |
| behaviour drift ระหว่าง port | regression | Phase 0 baseline เป็น oracle; ห้าม merge ถ้า test เดิม fail |
