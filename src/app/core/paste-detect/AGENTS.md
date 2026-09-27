# AGENTS.md — src/app/core/paste-detect/

Framework layer for Smart Paste-Detection (`DUDE_PRD.md` §21 Phase 21 Item 3). Like the rest of `core/`, no file here ever names a specific tool by id in a comment or branch of logic — `PASTE_DETECTORS` is data, not control flow.

## Why this is a hand-maintained registry, not a `<id>.paste-detect.ts` convention file

Transformation Pipelines (`core/pipeline/`) resolve a tool's adapter by dynamic import purely by naming convention, specifically to avoid a hand-maintained `id -> step` map — see `core/pipeline/AGENTS.md`. Smart Paste-Detection does **not** follow that precedent, on purpose:

- A pipeline step is resolved once, for one tool, at the moment a user deliberately adds it to a pipeline.
- Paste detection has to run **every one of its detectors against the same input** to rank the candidates, on every keystroke of the Smart Paste page's input. Resolving even a handful of tools via dynamic `import()` on every keystroke would mean synchronously awaiting several chunk loads for something that should feel instant.
- Unlike Pipelines (225 of 277 tools eligible), only a small, deliberately curated subset of tools has a shape unambiguous enough to paste-detect at all — the "hand-maintained map won't scale" argument that motivated the pipeline-step convention doesn't apply at this scale.

`PASTE_DETECTORS` (`paste-detectors.ts`) is therefore a plain array, imported eagerly by the (still lazy-loaded) Smart Paste route — see `shell/AGENTS.md` for that route's own sanction. Don't "fix" this to match the pipeline-step convention; that would reintroduce the exact per-paste import-latency problem this design avoids.

## Writing a detector

Reuse the owning tool's existing pure-logic export (e.g. `inspectUuid`, `decodeJwt`, `parseColor`) rather than reimplementing shape recognition — a detector is a thin `test(text): number | null` wrapper, never a parallel parser. Add a thin new exported predicate to the tool's own pure-logic file only if it doesn't already expose one; never duplicate parsing logic inline in `paste-detectors.ts`.

Score by specificity, not just "did it parse": a structurally exact shape (UUID, ULID, a 3-segment JWT) should score high (0.85–0.95); a shape that many arbitrary strings could incidentally satisfy (a decimal integer, valid Base64 alphabet) should score low (0.35–0.5) so it only surfaces when nothing more specific matches for the same input. `detectShapes` (`paste-detect.ts`) ranks by score and returns the top few, not a single verdict — ambiguous input is expected to show multiple candidates.

## Ambient Smart Paste (DUDE_PRD.md §21 Phase 24 Item 2) is a second consumer, not a parallel mechanism

The original Phase 21 Item 3 amendment deliberately deferred ambient/global paste capture. It now
ships as `ambient-paste.ts`'s `detectAmbientMatch`/`isEditablePasteTarget` plus
`shared/components/ambient-paste-chip/`, a global `paste` listener mounted once by `ShellLayout`.
This reuses `PASTE_DETECTORS`/`detectShapes` completely unmodified — the only new logic is a
stricter confidence floor (`AMBIENT_CONFIDENCE_FLOOR`, since an uninvited floating suggestion has a
higher false-positive cost than a page the user opened on purpose) and a guard against firing when
the paste already has an obvious destination (an input/textarea/contenteditable target, or the
`/smart-paste` page itself, which already does its own detection). Never duplicate the detector
array or the ranking function for this — both `/smart-paste` and the ambient chip must always see
identical shape recognition, differing only in threshold and trigger surface.

## Prefill (ID/token detectors)

`PasteHandoffService` is the one-shot, in-memory-only value hand-off used when the user picks a suggestion. It is intentionally not part of `PersistenceService` — see its own doc comment. The Smart Paste page calls `offer(toolId, value)` immediately before navigating; the target tool's component calls `consume(toolId)` once in its constructor. A tool with no `consume` call simply isn't paste-detection-eligible for prefill (still fine to have a detector for it — the suggestion would just navigate without prefilling).

## Text-format detectors (documents, not IDs)

The detectors at the end of `PASTE_DETECTORS` recognize whole documents — SVG, HTML, XML,
Markdown, YAML/Kubernetes, SQL, CSV, CSS, Dockerfile, `.env`, stack traces — via the structural
sniffers in `text-format-sniffers.ts`, **not** the owning tools' parsers. That's the one sanctioned
exception to "reuse the tool's pure-logic export": this array is imported by the ambient chip, i.e.
the prefetched shell bundle, and the real YAML/XML/SQL/SVGO parsers are heavy lazy dependencies.
A sniffer only has to be right about shape (false negatives are fine), must stay bounded on huge
input (head/tail only — see the file's header), and must be scored at or below JSON's 0.8 unless
the shape is unmistakable, so ID/token matches always win. `text-format-sniffers.spec.ts` holds the
positive/negative cases; `paste-detect-coverage.spec.ts` checks every one wins its sample and that
prose and JSON never get claimed.

Their targets don't `consume()` anything: they receive the paste through their declared text input
(`fileInput` / `desktopOpen.inputKey`) — the Smart Paste panel and ambient chip call
`TextInputHandoffService.offer` alongside `PasteHandoffService.offer` (see
`core/text-file-input/AGENTS.md`). `paste-detect-coverage.spec.ts` fails if any detector's target
has neither a `consume()` call nor a declared text input — the "suggested a tool, value vanished"
bug this section exists to prevent.
