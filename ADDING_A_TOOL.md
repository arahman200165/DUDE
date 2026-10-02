# Adding a Tool

DUDE's framework goal ([Core Product Goal](docs/DUDE_PRD.md#core-product-goal)) is that a new simple tool with existing transformation logic can be added in **30 minutes or less**, without touching the application shell, navigation, command palette, search, routing, PWA, or persistence/worker infrastructure. This doc walks through exactly how, using the real `base64` tool (`apps/web/src/app/tools/base64/`) as the worked example throughout.

If following these steps ever requires editing `ShellLayout`, `app.routes.ts`, or a shared service in `apps/web/src/app/core/`, that's an architecture gap — file it, don't route around it.

## 1. Create the tool owners

Create the Angular component and template in `apps/web/src/app/tools/<id>/`. Put portable transforms and their tests/fixtures in `packages/tool-engine/src/tools/<id>/`, or an existing foundational package when appropriate. Keep DOM, Canvas, worker factories and privileged implementations in host adapters. Base64 uses `@dude/crypto/base64-codec`.

```text
packages/tool-registry/src/tools/<id>/<id>.manifest.ts — metadata only
packages/tool-engine/src/tools/<id>/                  — engines, tests, fixtures
apps/web/src/app/tools/<id>/<id>.ts                   — Angular component
apps/web/src/app/tools/<id>/<id>.html
apps/web/src/app/tools/<id>/<id>.bindings.ts           — lazy UI/settings loaders
apps/web/src/app/tools/<id>/<id>.worker.ts             — optional browser adapter
```

## 2. Declare metadata and UI bindings

Create exactly one metadata manifest, exporting `manifest: ToolMetadata` from `@dude/domain/shared/models/tool-metadata.model`. Preserve the closed category vocabulary and the tool's stable ID/route. Metadata contains no functions, application imports, engine imports or native implementation imports.

```ts
import type { ToolMetadata } from '@dude/domain/shared/models/tool-metadata.model';
export const manifest: ToolMetadata = {
  id: 'base64', title: 'Base64 Encoder / Decoder',
  description: 'UTF-8-safe text-to-Base64 and Base64-to-text conversion.',
  category: 'encoding', keywords: ['base64', 'encode', 'decode'],
  route: '/tools/base64', status: 'stable',
  persistence: { input: 'session', preferences: 'local' },
  io: { accepts: ['text'], produces: ['text'] },
};
```

Beside the Angular component, export the lazy binding:

```ts
export const bindingId = 'base64';
export const binding = {
  load: () => import('./base64').then(m => m.Base64Tool),
};
```

If metadata declares a settings section, supply `settingsLoad` in the binding. Keep all imports literal and lazy. Pipeline/workspace steps and optional host adapters are discovered by their existing filename conventions; no manual core/shell registration is needed.

Run `npm run generate:registry` and `npm run build:packages`. Generation assembles portable metadata and Angular definitions, lazy engine maps, worker factories, documentation, security inventories, file associations and PWA shortcuts. Generated files must never be hand-edited. `npm start`, `npm test` and `npm run build` prepare registry/packages automatically; direct `ng` commands do not run npm hooks.

Declare imports in the owning workspace's dependencies. Packages expose compiled ESM/declarations through package exports; applications must consume those exports. Run `test:packages`, `check:boundaries` and `check:portable` after changing package boundaries. See [portable core ownership](docs/architecture/PORTABLE_CORE.md).

### Status & confidence tiers

`status` is one of three tiers ([Phase 23](docs/history/DELIVERY_HISTORY.md#phase-23) Item 1) — pick the one that honestly describes how the tool has actually been tested, not how finished the UI looks:

- **`experimental`** — the default assumption for anything new or still settling. Fine for a first cut.
- **`stable`** — the transform logic has real test coverage and the UI has been manually exercised end-to-end; this is the bar nearly every tool ships at today.
- **`verified`** - the manifest names concrete evidence suited to the tool's behavior. Use published test vectors when a standard defines exact examples; independently cross-check security-sensitive algorithms and complex formats where a mature reference exists; add seeded property or fuzz tests for pure transforms, parsers, and generators. Browser-dependent readers and stateful settings can use real-browser or integration tests that exercise their actual boundary. Set `verification.summary` to say precisely what passed and what was excluded; set only the `vectors`, `crossChecked`, and `propertyTested` fields supported by those tests. This tier records stronger internal evidence, not external certification. The Phase 23 rollout and exceptions are recorded in `.phase23/ledger.json` and `.phase23/FINAL_REPORT.md`.

## 3. Create the component

Wrap the tool's content in `<app-tool-shell>` (`apps/web/src/app/shared/components/tool-shell/tool-shell.ts`):

```html
<app-tool-shell>
  ...
</app-tool-shell>
```

`ToolShell` resolves its title, status badge, and (by default) network-required badge directly from the registered `ToolDefinition` — no inputs needed for the common case ([Phase 22](docs/history/DELIVERY_HISTORY.md#phase-22) Items 2/6: single source of truth, not duplicated at every call site). Only pass `[networkRequired]="someExpression()"` explicitly if the tool's network need is a genuinely dynamic, runtime condition the static registry value can't express (e.g. only fetching when a particular panel is open — see `jwt-verify`, `markdown-workspace`, `package-metadata-inspector`, or `text-inspector` for the pattern); when provided, it overrides the registry value.

Import other shared primitives as needed: `ErrorPanel`, `BusyIndicator` (for worker-backed tools), `OfflineBadge` (already included inside `ToolShell` itself).

**File input and output.** Nobody should have to open a file in another editor just to paste it into DUDE:

- *Binary/file tools* render `<app-file-drop>` — it receives a file dropped on the dashboard automatically (no `consume()` call; see `core/file-drop-detect/AGENTS.md`). If it only renders in one mode, `has(toolId)`-check `FileDropHandoffService` in the constructor and switch modes.
- *Text/code tools* pair `<app-open-text-file>` with the `appTextFileDrop` directive on the input, and declare `fileInput: { key, extensions }` in the manifest (skip it if `desktopOpen.inputKey` already names the same key). That makes the tool a Smart File Drop candidate for those extensions and prefills it — see `core/text-file-input/AGENTS.md`:

  ```html
  <app-open-text-file #open [text]="input()" (textLoaded)="input.set($event)" />
  <textarea [appTextFileDrop]="open" [value]="input()" (input)="onInput($event)"></textarea>
  ```
- *Text output* gets `<app-save-text-file [text]="output()" [source]="open" />` next to its copy button (pass `extension=".json"` when the output format differs from the input's). A tool rendering it must declare `file` in `io.produces`, and a `fileInput` tool `file` in `io.accepts` (`tool-conformance.spec.ts` checks both).

**Colors and appearance.** Dark is the default, but your tool also renders in Light, high contrast, six accents, three category palette sets, the color-blind-safe status set, and three densities ([Theme](docs/product/UX_SPEC.md#theme), [Color System](docs/product/UX_SPEC.md#color-system), [Accessibility](docs/product/UX_SPEC.md#accessibility)). Use theme tokens only:

- Surfaces and text: `bg-bg`, `bg-panel`, `bg-panel-elevated`, `border-border`, `text-text`, `text-text-muted`; status: `text-error`/`-warning`/`-success`/`-info`/`-busy`/`-offline`; category: `text-cat-<category>`; interaction: `accent`. Text on a filled accent surface is `text-on-accent`.
- `npm run lint` runs `scripts/check-design-tokens.mjs`, which fails a tool on raw Tailwind palette colors (`text-red-400`, `bg-white`, `bg-black/75`), the retired `text-bg`, an opacity modifier on a text color (`text-text-muted/70`), or a hex color in its `.html`/`.css`. A hex value in the tool's `.ts` is allowed when it is tool data (a color converter's input, a palette generator's output). The same lint runs `check-theme-contrast.mjs`, which proves the tokens themselves in every combination; it can only vouch for your tool if the tool uses them.
- Don't carry meaning by color alone: put `app-status-glyph` beside a status label.
- If the tool previews the **user's own** document (HTML, SVG, an image), let the document keep its colors: add `<app-preview-background [(value)]="previewBg" />` and put `[appPreviewBackground]="previewBg()"` on the element that frames the preview; persist the choice as a `local` UI preference (see `html-preview`). An iframe hosting such a document also gets the `dude-doc-frame` class.
- If the tool previews **user-authored motion** in `app-css-preview-sandbox`, pass `[motion]="true"` (see `css-animation-builder`): the preview is then exempt from the global reduced-motion rule and starts paused with a Play control when the user has asked for reduced motion. All other animation is removed under Reduce, so don't make tool behavior depend on an animation or transition finishing.
- Code that reads token colors in script (a canvas or chart) must re-read them when `AppearanceService.revision()` changes, as the shared `workbench-charts` do; a color captured once at init is wrong after the next theme switch.

## 4. Choose a persistence policy

For each piece of state, call `PersistenceService.signal(toolId, key, policy, initialValue)` (`apps/web/src/app/core/persistence/persistence.service.ts`), where `policy` is `'none' | 'session' | 'local' | 'user-choice'`:

```ts
protected readonly mode = this.persistence.signal<Base64Mode>('base64', 'mode', 'local', 'encode');
protected readonly input = this.persistence.signal('base64', 'input', 'session', '');
```

Rule of thumb, drawn from the existing 9 tools:
- raw user input → `'session'` (cleared when the tab closes; base64, json, hash, regex, diff, markdown, text-inspector all do this)
- UI preferences (mode, indent, algorithm choice) → `'local'` (persists across sessions; base64's `mode`, json's `mode`/`indent`)
- anything sensitive → `'none'` (jwt persists nothing at all — see `TOOL_DEFINITIONS`'s `jwt` entry)

**Data scope.** Each persisted key also gets a data scope, derived with no extra work: a `'local'` preference is `environment` scope, while `'session'`, `'user-choice'` and `'none'` inputs are `local-only` (a scope classifies ownership; it never makes a value synchronize). If a preference is really machine-specific (a path, an executable, an endpoint) declare it in the manifest: `settingScopes: { terminalPath: { scope: 'device' } }`. The key must be one the tool actually persists, and `tool-conformance.spec.ts` checks it. Persisted keys are stable once shipped; there are no per-tool storage migrations (`storageMigrations` and `moveLocalValue` were removed), so keep stored shapes backward-compatible or validate on read. Secrets never go in `persistence.signal`: use `SecretsService` by purpose through a desktop-only capability.

## 5. Choose a worker policy

If the transform can be slow on large input, keep it pure and framework-free (step 1) so it can run unmodified in a Worker. Create `<id>.worker.ts` mirroring one of the four existing glue files (e.g. `apps/web/src/app/tools/json/json-format.worker.ts`):

```ts
export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<MyPayload>>): void {
  const { id, payload } = data;
  try {
    postMessage(resultMessage(id, myPureTransform(payload)));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
```

(`handleMessage` is exported specifically so it can be unit-tested directly — see Milestone 9's `regex-match.worker.spec.ts` for the pattern: stub `postMessage` with `vi.stubGlobal`, call `handleMessage` with a fake `MessageEvent`, assert on what got posted.)

In the component, decide when to dispatch to the worker:
- **always** (`execution: { worker: 'required' }`) — hash, regex, and diff all do this.
- **above a size threshold** (`execution: { worker: 'optional' }`) — json's approach, via a `WORKER_THRESHOLD` constant and a `computed()` that switches between a synchronous call and a worker dispatch (see `apps/web/src/app/tools/json/json.ts`).

Either way, call `WorkerClientService.run` (`apps/web/src/app/core/workers/worker-client.service.ts`):

```ts
const job = this.workerClient.run<MyPayload, MyResult>(
  () => new Worker(new URL('./my-tool.worker', import.meta.url), { type: 'module' }),
  payload,
);
```

and bind the returned `WorkerJob`'s `status()` / `progress()` / `result()` / `error()` signals in the template via `<app-busy-indicator>` / `<app-error-panel>`.

## 6. Choose a network policy

If the tool genuinely needs network access, set `network: { required: true }` in the manifest — `ToolShell` picks this up automatically (step 3), no template binding needed unless the need is dynamic. Most tools set this to false/omit it. Per the PRD's scope gate ([Historical V1 Definition of Done](docs/history/DELIVERY_HISTORY.md#historical-v1-definition-of-done)), think hard before requiring network — there's no backend and no API-key infrastructure wired into most showcase tools.

**Platform capabilities and runtimes.** If the tool injects a desktop-only service (`NativeFsService`, `FileWatchService`, `LlmProxyService`, `CollabService`, `SecretsService`) or loads a vendored runtime (`assets/vendor/pyodide`, `sql.js`, `xmllint-wasm`, `assets/vendor/ejs.min.js`), declare it in `capabilities` using the closed vocabulary in `apps/web/src/app/shared/models/tool-capability.model.ts`. For example: `capabilities: [{ kind: 'platform', id: 'native-fs', web: 'fallback', note: 'reads a real folder on disk' }]` or `[{ kind: 'runtime', runtime: 'pyodide' }]`. Use `web: 'fallback'` when the tool still does its job in a browser, and `'unavailable'` when that one feature is absent there. `tool-conformance.spec.ts` fails in both directions: an undeclared import, or a declaration with no matching import. `npm run generate:registry` turns these declarations into the Web Capability Matrix in `SECURITY.md` and `README.md`.

A feature declared `web: 'unavailable'` must stay visible on the web rather than disappear. Next to the control you render only on desktop, add `<app-desktop-only-control capability="<id>" label="<control label>" />`. It renders a disabled, badged stand-in in the browser and nothing on desktop, and conformance checks that it's present.

**PWA shortcut (rare).** `pwaShortcut: { order: N }` adds the tool to the installed web app's jump list, via the generated `apps/web/public/manifest.webmanifest`. Browsers only show a handful, so the cap is 10. Only take a slot for a genuinely top-used tool.

### Web/desktop parity fixtures

A tool with a `<id>.pipeline-step.ts` adapter joins `core/parity/web-desktop-parity.spec.ts` automatically. The suite runs the same input with and without the fake Electron bridge and compares the full result. It derives a representative input from the first accepted type unless you add `<id>.parity-fixtures.ts` beside the adapter:

```ts
import type { PipelineValue } from '../../shared/models/pipeline-step.model';
export const fixtures: readonly { input: PipelineValue; expected?: PipelineValue }[] = [
  { input: { type: 'text', value: 'SGVsbG8=' }, expected: { type: 'text', value: 'Hello' } },
];
```

Prefer valid, deterministic vectors with an explicit expected output. If a step uses fresh entropy, time, a browser-only runtime, or another environment-dependent source, document why exact result equality cannot be tested in a colocated `<id>.parity-exclusion.json` (`{ "reason": "..." }`); keep its own behavior tests. A `web: 'fallback'` capability additionally requires a colocated `<id>.parity.spec.ts` that compares the web and native adapters against the same fixture.

## 7. Declare I/O capabilities

Set `io: { accepts: [...], produces: [...] }` in the `ToolDefinition` — the field is required (`io:`, not `io?:`) so the compiler rejects a tool that forgets it. Use the shared vocabulary in `packages/shared-types/src/shared/models/tool-io.model.ts` (`DudeDataType`: `text`, `json`, `bytes`, `file`, `table`, `url`, `http-response`). This is the "Universal Input/Output Contract" from [Phase 21](docs/history/DELIVERY_HISTORY.md#phase-21) — like `persistence`/`execution`/`network`, it's declarative documentation only (not read by the shell at runtime yet), but it's what a future pipeline/Smart-Paste feature would build on, so keep it honest: describe what the tool's UI/logic actually consumes and emits today, not aspirational future capability. `tool-count.spec.ts`'s "Universal I/O contract coverage" spec still guards against a technically-present-but-empty `accepts`/`produces` array, which the required-field type check alone doesn't catch.

Milestone 282 audited all 277 existing entries and fixed the drift it found; apply these conventions rather than reinventing them per tool:

- **A download/export button means `file` belongs in `produces`.** This was the single most common miss — a tool with a "Download" affordance that only declared `text`/`json`. If the component calls `downloadFile(...)` or otherwise hands the user a file to save, `file` must be in `produces`.
- **A pure knob/option generator with no paste-and-parse or inspect mode declares `accepts: ['json']`** — its discrete form controls are conceptually a config object (see `password-generator`, `pkce-generator`, `lorem-ipsum-generator`). A generator that *also* accepts pasted text to inspect/decode an existing value (see `uuid`, `ulid-tools`) keeps `text` too.
- **A tool that decodes/analyzes input into itemized structured fields** (not just a pass/fail message) should include `json` in `produces` alongside any human-readable text — see the JWT/OAuth cluster (`jwt`, `oauth-token-inspector`) and the ID-inspector cluster (`uuid`, `ulid-tools`, `snowflake-id-tools`, `ksuid-tools`).
- A tool whose declared `io` can't honestly represent something it does (e.g. a live webcam/camera input stream, as in `qr-code-scanner`) should still declare the closest reasonable fit rather than a wrong one — don't stretch an existing `DudeDataType` to cover a genuinely different capability. Vocabulary gaps like this are a known, accepted limitation of the current 7-type set (see [Roadmap Direction](docs/delivery/ROADMAP.md#roadmap-direction)'s Phase 21 note), not something to work around per-tool.

## 8. Choose your workspace/history participation

Optional — a tool with no `<id>.workspace-step.ts` file simply isn't eligible for live tab/panel mirroring ([Phase 21](docs/history/DELIVERY_HISTORY.md#phase-21) Item 4) or Local History (Item 5); that's a normal, common outcome, not an error (`core/workspace/workspace-coverage.spec.ts` tracks every tool's decision either way). If the tool has a real, restorable content field (not just a live-clock/interactive-only state, and not a File/Blob that never touches `PersistenceService`), add `apps/web/src/app/tools/<id>/<id>.workspace-step.ts` exporting `workspaceStep: WorkspaceStep` (`packages/contracts/src/shared/models/workspace-step.model.ts`):

```ts
export const workspaceStep: WorkspaceStep = {
  historyEligible: true, // omit entirely for anything sensitive-by-design — see core/history/AGENTS.md
  snapshot(): WorkspaceSnapshot | undefined {
    const input = readStorageValue<string>('my-tool', 'input', 'session');
    if (!input) return undefined;
    return { state: { input }, summary: `My Tool: "${input.slice(0, 40)}"` };
  },
  restore(state): void {
    if (typeof state['input'] === 'string') writeStorageValue('my-tool', 'input', 'session', state['input']);
  },
};
```

`readStorageValue`/`writeStorageValue` (`apps/web/src/app/core/workspace/workspace-storage-bridge.ts`) read/write the *exact same* storage keys your step-4 `persistence.signal(...)` calls already use — never invent a new key or a different policy than what you chose in step 4. A `'none'`-policy field (nothing ever touches storage, e.g. `jwt`'s token) can't use the bridge at all; use the in-memory `offerWorkspaceState`/`consumeWorkspaceState` pair (`packages/tool-engine/src/core/workspace/workspace-handoff.ts`) instead, and add one line to your own constructor consuming the hand-off — see `apps/web/src/app/tools/jwt/jwt.ts` for the worked example. `historyEligible` defaults to excluded and must be a deliberate, explicit opt-in — see `core/history/AGENTS.md` for the exclusion categories (sensitive-by-design, pure reference/lookup, sandboxed execution needs source-only). Write a matching `<id>.workspace-step.spec.ts` mirroring `apps/web/src/app/tools/base64/base64.workspace-step.spec.ts`.

### Optional: contribute a Settings panel

If the tool has a *global* preference that users set once rather than per use (a server URL, a default profile), declare `settingsSection` in the manifest instead of building a settings UI inside the tool. It appears under Settings › Tools at `/settings/tools/<id>`, in the Ctrl+K "Settings: …" commands, and (with `onboarding: true`) in the desktop setup wizard, without touching `shell/`:

```ts
settingsSection: {
  title: 'Collaboration relay',
  keywords: ['relay', 'websocket'],
  desktopOnly: true, // web lists it with a Desktop badge and an explainer
  workspaceOverridable: [{ key: 'relayUrl', label: 'Relay URL', type: 'url' }], // optional
},
```

Declare `settingsLoad: () => import('./my-tool.settings').then(m => m.MyToolSettings)` in the app binding, never in portable metadata.

The panel component reads and writes the tool's own `local` `persistence.signal(...)` keys. For a key listed in `workspaceOverridable`, the tool reads it through `resolvePreference(toolId, key, globalSignal)` (`core/workspace/workspace-preference.ts`); the Workspace settings popover and templates/projects handle the rest generically. There are no storage-key migrations; treat persisted keys as stable. `tools/markdown-workspace/` is the worked example.

## 9. Expose the lazy route/component

Nothing to do beyond step 2. `buildToolRoutes()` (`apps/web/src/app/core/registry/tool-routes.ts`) automatically turns every `TOOL_DEFINITIONS` entry into a lazy `loadComponent` route nested under the root `ShellLayout` (`apps/web/src/app/core/routing/app.routes.ts`). No route file edits needed — this is the "shell generated from tool metadata" promise ([Registry responsibilities](docs/architecture/SYSTEM_ARCHITECTURE.md#registry-responsibilities)) actually working.

## 10. Add tests where appropriate

A framework-free `.spec.ts` for the pure transform is the highest-value test (fast, no TestBed) — see `base64-codec.spec.ts`. Only add a component-level spec if there's real branching logic in the component itself (e.g. json's worker-threshold test, `apps/web/src/app/tools/json/json.spec.ts`). Don't chase coverage for its own sake ([Testing Strategy](docs/delivery/QUALITY_AND_RELEASE.md#testing-strategy) — "ship first").

If the transform is round-trip-capable (an `encode`/`decode` or `parse`/`format` pair, or any `f`/`f⁻¹`), add one `fast-check` property case alongside the example-based tests ([Phase 23](docs/history/DELIVERY_HISTORY.md#phase-23) Item 4) — it catches the edge cases hand-picked examples miss:

```ts
import fc from 'fast-check';

it('decodeX(encodeX(x)) === x for any input', () => {
  fc.assert(
    fc.property(fc.string(), (text) => {
      const encoded = encodeX(text);
      expect(encoded.ok).toBe(true);
      if (!encoded.ok) return;
      expect(decodeX(encoded.value)).toEqual({ ok: true, value: text });
    }),
  );
});
```

See `base64-codec.spec.ts`, `url-encode-codec.spec.ts`, and `number-base-convert.spec.ts` for real examples. Don't force this onto a transform that isn't genuinely round-trip-capable (e.g. a lossy formatter, or one direction only) — it isn't a mandatory addition to every tool's spec.

If the tool parses structured/untrusted input (JSON, YAML, XML, a config format, a binary format, a URL, an expression), add a `fast-check` fuzz case asserting the parse function never throws uncaught and always returns its typed `Result` — never semantic correctness, just crash-safety against adversarial input ([Phase 23](docs/history/DELIVERY_HISTORY.md#phase-23) Item 5):

```ts
it('never throws for arbitrary text input', () => {
  fc.assert(
    fc.property(fc.string(), (input) => {
      expect(() => parseThing(input)).not.toThrow();
    }),
  );
});
```

See `json-format.spec.ts`, `yaml-convert.spec.ts`, and `xml-format.spec.ts` for real examples.

If the tool parses a complex real-world binary/structured format (PE, ELF, Mach-O, a certificate, a container format), don't rely solely on a hand-synthesized minimal fixture built byte-by-byte in the spec — also add a **golden corpus** fixture ([Phase 23](docs/history/DELIVERY_HISTORY.md#phase-23) Item 6): a real sample under `<id>/__fixtures__/`, read via `readFileSync(resolve(process.cwd(), 'packages/tool-engine/src/tools/<id>/__fixtures__/<name>'))`, with expected field values taken from an independent reference tool/library — never derived by running DUDE's own parser and copying its output. `__fixtures__/` is never referenced by `angular.json`'s `assets` globs, so nothing there ships in the app bundle. Document the fixture's exact provenance (how it was produced) and the independent cross-check tool/command in a short `__fixtures__/README.md`. See `pe-header-viewer`, `elf-header-viewer`, and `macho-header-viewer` for real examples — all three fixtures are genuine binaries produced by `dotnet publish -r <rid>` (which fetches the real prebuilt apphost package for that platform, no cross-compiler needed) and cross-checked with `pefile`/`pyelftools`/`lief` respectively.

## 11. Verify search/sidebar/command palette discovery

Run the app (`ng serve`) and confirm:
- the tool appears in the sidebar under its category;
- typing part of its title/keywords into the deck search or the command palette (`Ctrl+K`) surfaces it.

Then run `npm test` — `tool-search.spec.ts`, `tool-registry.service.spec.ts`, and `tool-conformance.spec.ts` iterate the real `TOOL_DEFINITIONS` array, so a malformed new manifest (duplicate id, duplicate route, invalid category, empty `io`, etc.) will usually fail one of them immediately. README.md's "N tools ship today" line and Tools table are generated, not hand-edited — `npm run generate:registry` (which `pretest`/`prestart`/`prebuild` already run for you) regenerates both from the registry; CI fails the build if the committed files are stale relative to what regenerating would produce.

## 12. Verify the direct URL

After `ng build`, confirm the lazy chunk loads and the route resolves correctly when hit directly (not just via in-app navigation) — this is what Milestone 9's `e2e/production-direct-route.spec.ts` automates for the `json` tool as a template if you want to extend it. At minimum, serve the production build locally and hard-navigate to `/DUDE/tools/<id>` to confirm it isn't relying on client-side router state that a fresh page load wouldn't have.

## Adding a Home panel (not a tool)

The Home/Browse Tools/Sidebar responsibility split, panel ownership rules, layout persistence and dashboard/chart conventions are documented in `apps/web/src/app/shell/deck/AGENTS.md`; this section is the recipe.

Registering a tool never creates a Home panel — a panel is its own explicit declaration (DUDE_PRD.md Phase 30I). A feature that wants one (a tool's status card, Git status, running processes, certificate expiry, …) adds a colocated **`<kind-id>.panel-manifest.ts`** next to its component and touches nothing in `apps/web/src/app/shell/`, `apps/web/src/app/core/` or Settings:

```ts
import type { PanelDefinition } from '<rel>/shared/models/panel-definition.model';

export const panel: PanelDefinition = {
  id: 'my-panel',                       // kebab-case; must equal the file name
  title: 'My panel',
  description: 'One sentence shown in the picker.',
  load: () => import('./my-panel').then((m) => m.MyPanel),
  size: { minW: 4, minH: 2 },           // whole 12-column grid cells
  defaultPlacement: { order: 20, w: 6, h: 3 },   // omit to keep it out of the shipped default
  dataDependencies: ['usage'],          // authoritative sources it reads live (never a copy)
  // multiInstance + config: [...]      // only when per-instance config makes duplicates distinct
  // desktopOnly / capabilities + webBehavior: 'omit' | 'explain'   // desktop-only panels
  // showWhen: () => inject(SomeService).hasData()                  // omit (and close the gap) when empty
  // deferUntilVisible: true            // heavy, below-the-fold panels
};
```

The panel component injects its own data from the owning service (never a copied store) and, when it needs its instance id or config, `inject(PANEL_CONTEXT, { optional: true })`. It must **never do anything consequential on mount** — actions happen on a click, through the target's existing confirmation path.

Then run `npm run generate:registry` (`pretest`/`prestart`/`prebuild` do it for you); it regenerates `core/registry/panel-definitions.ts`, which CI checks is current. `home-layout-framework.spec.ts` validates every manifest (unique kebab-case ids, matching file names, size and default-placement sanity, config defaults, closed data-dependency vocabulary), and the panel appears in Settings › Home layout's picker automatically. Kinds are referenced by id from persisted layouts, so a rename needs `replaces: ['old-id']` and a removal degrades to a dormant, removable entry rather than breaking anyone's Home. Existing users with a saved layout do not gain new kinds unprompted — they find them in the picker.
