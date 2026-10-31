# Phase 31A implementation and acceptance evidence

Status: complete. Implementation recorded as Milestone 615; the inherited dependency-audit blocker was closed afterwards by upgrading Angular and DOMPurify and by accepting one unpatched node-forge advisory (see [Dependency audit](#dependency-audit)). Every gate below was re-run against the upgraded lockfile. No deployment or publication is claimed.

## Implemented scope

The web renderer, Electron composition and collaboration relay reside in npm workspaces. Nine private portable packages emit ESM/declarations; the existing Node Yjs room implementation belongs to the separate `collab-protocol` workspace. Hub/mobile/infrastructure directories are documented placeholders. Root commands, lockfile, Node/npm pins, artifact locations and desktop version ownership are preserved.

The checked inventories resolve 2,691 source owners, 78 component extraction groups, all 333 metadata/binding registrations and 869 storage declaration/sites. Portable transforms, tests and fixtures follow their owners; application code retains signals, UI composition, storage and explicit browser/native host adapters. Metadata owns no UI loaders or engines. Generated literal imports preserve lazy discovery. Data scope is independent of retention, sensitivity and consent; no existing record is migrated or granted synchronization permission.

## Verification results

Results were captured locally on Windows with Node 24.21.0/npm 11.19.0. They were first recorded with the Phase 31 lockfile, then re-run after the dependency remediation (Angular 22.2.1, DOMPurify 3.4.16): unit/package suites, lint/design, host type checks, portable consumption, generator freshness, Electron, high-consequence, performance, e2e (137 pass), appearance (1,188 pass), Windows packaging, production desktop acceptance and development discovery all pass again. The compiled relay runtime, native helper builds and the fresh-install repeatability comparison were not repeated after the upgrade.

| Check | Result |
|---|---|
| Portable package builds and independent installation | Nine packages build with Angular/Electron/apps/Node collaboration absent; consumer declarations compile and 1,234 compiled ESM modules import. The offline isolated install is pinned to the root lockfile, so it needs only the tarballs `npm ci` caches; it passes against a cache populated solely by a clean `npm ci`, and no app-only dependency is installed |
| Package boundaries | Source, test ownership, declared dependencies, emitted imports and declaration exports pass |
| Extraction/scope inventory and registry baseline | All resolved; all 333 IDs/routes/metadata match the immutable Phase 31 baseline |
| Portable engine/contract suite | 663 files, 4,317 tests pass; existing vectors/property tests/fixtures move with engines |
| Angular adapters/framework | 722 files, 7,786 tests pass, including worker cancellation/errors and registry-wide web/desktop parity |
| High-consequence gate | Full portable suite plus 50 application test files/187 confirmation/tool tests pass; native trust tests remain active |
| Electron boundary/helper suite | 66 files, 449 tests pass |
| Production routes/PWA/offline | 137 Playwright tests pass; includes hard navigation/refresh for pure, worker, DOM, WASM, sandbox and desktop-only tools plus workbench/settings routes |
| Appearance matrix | All 1,188 production appearance/color/layout cases pass |
| Performance corpus | Seven tests across six files pass |
| Lint/design | Package boundaries, design tokens, generated theme and 49,008 contrast checks across 144 combinations pass |
| Development discovery | Running Angular development server: sidebar, Home search and Ctrl+K discover/open Base64 |
| Desktop/relay type checking and builds | Both host declarations pass; esbuild retains CommonJS outputs |
| Compiled relay runtime | Health endpoint, room admission and wrong-code rejection pass. Docker inputs are updated; container execution is unverified because the local Docker daemon is unavailable |
| Native helper builds | All three MSVC helpers compile; ICMP IPv4/IPv6 loopback probes succeed |
| Production desktop acceptance | Cold/warm launches, preload isolation, helper reads, mutation read-allowlist rejection, grants/walk, deep links, picker/command-line file handoff and saved state pass |
| Windows packaging | NSIS installer and AppX creation succeed with publishing disabled; version remains root-owned 0.0.44. All three packaged helper hashes match their sources and all three helpers exist in AppX |
| Fresh installation and repeatability | Offline `npm ci` in a separate temporary tree; two matching production builds across 1,296 files. Only `ngsw.json:timestamp` is normalized; all content/asset hashes are compared |

The desktop harness uses an isolated profile, fixture dialogs and a stable fixture loopback origin across launches. It prevents OS protocol/login-setting installation and keeps windows hidden. Renderer warm persistence is therefore verified at that controlled origin; it does not establish persistence across different OS-assigned production ports. Mobile execution is unverified. Store signing/identity and publishing retain their existing limitations and are not claimed here.

The test work also resolved fixture isolation exposed by the combined suites and a native bundle-export race: startup staging cleanup now finishes before a new export begins. IPC names/payloads and confirmation/grant behavior remain unchanged.

## Dependency audit

Milestone 615 landed with `npm audit --audit-level=high --omit=dev` failing on three advisories inherited from the Phase 31 lockfile (two high, one low). They were resolved as follows:

| Dependency | Advisory | Resolution |
|---|---|---|
| `@angular/router` 22.1.7 | [GHSA-ff3f-86qr-9cv3](https://github.com/advisories/GHSA-ff3f-86qr-9cv3), high | Every `@angular/*` package upgraded together to 22.2.1 |
| `dompurify` 3.4.15 | [GHSA-p98j-92pf-mc4p](https://github.com/advisories/GHSA-p98j-92pf-mc4p), low | Upgraded to 3.4.16 |
| `node-forge` 1.4.0 | [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), high | Accepted at the time; upgraded to 1.4.2 on 2026-10-30 once a patched release shipped, and removed from the accepted list |

The Angular upgrade required two follow-ups. The initial bundle grew by about 0.7 kB, past the 1.1 MB error budget (it was already within about 200 bytes of it), so the error budget is now 1.5 MB. Angular 22.2 also writes the esbuild metafile as `dist/dude/browser-stats.json` instead of `stats.json`, and `scripts/generate-offline-map.mjs` reads the new name.

**node-forge acceptance (closed 2026-10-30).** The flaw lets a crafted RSA PKCS#1 v1.5 signature verify under a low-exponent (e=3) key by hiding bytes in the DigestAlgorithm parameters. Only two call sites verify signatures through forge, and both are informational: the CSR Inspector's signature badge (`csr-logic.ts`, a self-signed CSR whose author already controls the key) and Certificate Chain Tools' "Verify chain" (`certificate-chain-logic.ts`, anchored on the last certificate of the user's own pasted bundle, not a trust store). Desktop trust decisions (live TLS, OCSP/CRL) use `node:crypto`. No maintained alternative covers forge's full use here: @peculiar/x509 has no PKCS#12, pkijs relies on WebCrypto, which lacks the 3DES/RC2 ciphers legacy PFX files need, and jsrsasign is end-of-life. Forge stays, with no compensating code change, until a patched release ships.

**braces acceptance (2026-10-07).** [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) (high, stack exhaustion on deeply nested brace patterns) covers every published release, and 3.0.3 is the latest. `braces` is reached only through `expo` > `@expo/cli` > `@expo/metro-file-map` > `micromatch` in the mobile workspace, where Metro globs the developer's own project at build time; it never handles untrusted input and ships in no runtime. It stays until a patched release exists. `npm audit` suggests downgrading `expo` to 44 as the "fix" for both this and node-forge; `check-production-audit.mjs` ignores a semver-major parent downgrade because it is not a patched release of the vulnerable package.

**zod acceptance (2026-10-25).** [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) (high, memory exhaustion while validating oversized constrained collections) is fixed only in zod 4.6.6. The root `zod` that `@angular/forms` pulls in was held at 4.6.5 by `@angular/cli` 22.2.1, which pins it exactly, so every `@angular/*` package moved together in the same change (framework packages to 22.2.3; `@angular/cdk`, `@angular/build` and `@angular/cli` to 22.2.4, whose CLI pins zod 4.6.6). The same change moved `electron` to 44.9.3 ([GHSA-jr5w-w6x2-84p9](https://github.com/advisories/GHSA-jr5w-w6x2-84p9)) and the `undici` under `@electron/get` to 7.30.1 ([GHSA-xjj6-f33q-929c](https://github.com/advisories/GHSA-xjj6-f33q-929c)), both within their existing ranges. The remaining copy is `expo` > `@expo/cli` > `zod` 3.25.76, the last 3.x, which `@expo/cli` pins with `^3.25.76`. Expo's CLI uses it only to validate its own dev-tools plugin schemas during `expo start` in the mobile workspace; it never handles untrusted input and ships in no runtime. It stays until Expo moves to a patched zod, at which point `npm audit` reports a fix and the acceptance stops holding.

**decode-uri-component acceptance (2026-10-30).** [GHSA-qr28-fpjm-wq7f](https://github.com/advisories/GHSA-qr28-fpjm-wq7f) (high, denial of service through quadratic replacement of percent-encoded runs) is fixed in 0.5.1, which is ESM-only. `query-string` 7.1.3, the last 7.x, `require()`s `decode-uri-component` ^0.2.2 and calls the result as a function, so forcing 0.5.1 through an override would break query parsing in the Metro bundle. The vulnerable copy is reached only through `expo-router` > `query-string` in the mobile workspace; the worst case is a slow query-string parse in the app process, with no data exposure. It stays until `expo-router` moves to a `query-string` that depends on a patched release.

`npm run audit:prod` (`scripts/check-production-audit.mjs`) replaces the raw audit command in CI. It fails on any high or critical production advisory except an entry in its accepted list, and it fails again for an accepted entry as soon as npm reports a fix, so the exception cannot outlive the missing patch.

## Reproduction and ownership

Root commands: `npm run audit:prod`, `npm test`, `npm run lint`, `npm run check:portable`, `npm run check:hosts`, `npm run check:inventory`, `npm run check:generated`, `npm run check:clean`, `npm run test:electron`, `npm run test:high-consequence`, `npm run test:e2e`, `npm run test:appearance`, `npm run test:perf`, `npm run electron:package -- --publish never`. Run `npm run check:desktop` after the Electron production renderer/main and native helpers are built. Run `node scripts/check-workspace-inventory.mjs --check --baseline` for the one-time immutable metadata comparison; ordinary inventory checks allow future tools/metadata changes.

Machine-specific raw logs, independent-install trees, desktop profiles and installer outputs are ignored. Durable inventories live in `docs/architecture/phase31a-extraction-inventory.json`, `data-scope-inventory.json`, `data-scope-entities.json` and `phase31a-registry-baseline.json`; move/component records live in `tests/extraction/`. [Portable core ownership](../architecture/PORTABLE_CORE.md) and `ADDING_A_TOOL.md` describe the maintained architecture.
