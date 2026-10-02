# Phase 23 / Tier 5 — RECIPE.md

Read this file before starting your batch. It has everything you need; you should not need to
read DUDE_PRD.md or the plan file.

## Recipes (assigned per tool in the ledger)

- ROUNDTRIP: codecs and converters. `decode(encode(x)) === x` over valid inputs,
  plus neverThrows on arbitrary strings/bytes.
- FUZZ: pure transforms with no inverse. neverThrows plus 1–2 cheap invariants
  (output type, length bounds, idempotence where it applies).
- GENERATOR: ID/CSS/gradient/palette/QR/barcode generators. Output matches the
  expected format (regex/parse check), same seed gives same output, valid across
  the option space.
- CORE-ONLY: tools that depend on browser APIs or the DOM (scanners, readers,
  file-base64, color-blindness-simulator). Test only the extracted pure core.
  If there's no pure core, extract one only if it's trivial. Otherwise mark the
  tool `blocked: needs-browser-harness` in the ledger and move on.
- CROSSCHECK (security): known-answer vectors from RFCs/specs plus comparison
  against Node `crypto` or another reference implementation, Tier-1 style.
  Round-trip alone is not enough.

- INTEGRATION: Angular/service-driven tools without a meaningful pure transform. Use TestBed with isolated service mocks to exercise consequential UI flows and async boundaries; add fast-check properties over generated input/state sequences when they assert behavior across a useful range. Cover confirmation cancel and confirm paths for destructive UI. Do not claim property testing unless a generated property is included.

The shared harness lives at `apps/web/src/testing/property-harness.ts`:
- `roundTrip(encode, decode, arb, opts?)`
- `neverThrows(fn, arb, opts?)` (also asserts the return type/shape if given)
- `invariant(fn, arb, predicate, opts?)`

All three use a fixed seed and `numRuns: 200` by default (global fast-check config is also seeded
via `apps/web/src/testing/fast-check.setup.ts`, wired in `angular.json`'s `test.options.setupFiles`, so
every fast-check test in the suite — harness or raw `fc.assert` — is deterministic).

## Worker instructions

For each tool in your list:
1. Read only `apps/web/src/app/tools/<id>/*` (logic file + manifest). Skip templates/styles.
2. Write `<id>.property.spec.ts` using `apps/web/src/testing/property-harness.ts` and the
   recipe assigned in the ledger. Keep tests short and don't duplicate existing specs.
3. After all tools are written, run tests once for the whole batch:
   `npx ng test --watch=false --include=apps/web/src/app/tools/<id1>/*.spec.ts --include=apps/web/src/app/tools/<id2>/*.spec.ts ...`
   Pipe the output through a filter so you only see failures and the summary line.
4. For each failure: decide whether it's a real bug or a bad arbitrary. Fix real
   bugs minimally in the tool's source. Constrain bad arbitraries. Re-run only
   the failing tools. Stop after 2 fix attempts per tool and mark the tool
   `blocked` with a one-line reason.
5. Promote each passing tool's manifest: `status: 'verified'` plus a
   verification block matching base64's format (see `apps/web/src/app/tools/base64/base64.manifest.ts`):
   ```ts
   status: 'verified',
   verification: {
     propertyTested: true,
     summary: 'One line: what was tested and how (round-trip/fuzz/crosscheck) and against what.',
   },
   ```
6. Lint only the changed files: `npx eslint <changed files>`.
7. Update `.phase23/ledger.json` (status, recipe used, bug notes). Valid `status` values:
   `verified` or `blocked`. Set `milestone` to this batch's milestone number for every tool you
   touch, whether verified or blocked.
8. Commit the batch once: `Milestone N: Tier 5 <category/subdomain> batch — <k> tools verified[, <b> bugs fixed]`.
   List the tool ids and a one-line note per bug in the commit body.
9. Return to the orchestrator in at most 10 lines: milestone number, commit
   hash, verified ids, blocked ids with reasons, bugs fixed (one line each),
   anything flagged. No test logs, no diffs.

## Notes

- A bug fix that changes a tool's public behavior or touches shared code outside
  `apps/web/src/app/tools/<id>` is flagged in the ledger (`notes` field, e.g. `flagged: touches shared code in <path>`),
  not silently applied.
- Never `git push`. Commit locally only.
- Don't run `git` or `ng test` concurrently with anything else — you're the only worker running
  right now for this batch.
