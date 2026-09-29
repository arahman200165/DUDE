# Appearance matrix (Phase 30K)

Automated sweep of every Settings › Appearance axis combination against the production build.

## What it covers

- `combos.ts` reads `src/styles/theme/theme-tokens.json` at runtime and builds the full cross-product of every axis in `axes`. New values or axes added by later milestones are picked up with no test edits.
- `matrix.spec.ts`, one test per combination. Preferences are seeded into `dude:v1:settings:appearance` before any page script runs. Pages visited: Home, the Ctrl+K command palette (opened, populated, closed), Browse Tools, Settings › Appearance, and one tool (rotates through 8 tools, one per category, by combination index).
- Checks per page (all `expect.soft`, so one test reports every failure for its combination):
  - pre-paint: `<html>` `data-*` attributes are already correct when the first `<body>` element appears (MutationObserver probe, see `checks.ts`), and still correct after Angular boots;
  - no horizontal overflow;
  - focus indicator (outline >= 2px or box-shadow ring, >= 3:1 against its surroundings) at Tab stops 1 and 4 on Home and the tool page;
  - WCAG text contrast on up to ~600 sampled text elements (4.5 normal / 3 large; 7 / 4.5 when `contrast` is `high`). Elements with gradient/image backdrops, opacity < 1, disabled or `aria-hidden` state, and `[data-contrast-exempt]` / `[data-motion-exempt]` previews are skipped;
  - no `console.error` / `pageerror`.
- Layout sub-matrix: every combination of `LAYOUT_AXES` (theme, contrast, density) x viewports 1920x1080, 1440x900, 1366x768 (other axes at defaults), checking overflow and focus ring only.
- A `/settings/appearance` redirect or not-found is recorded as a `finding` annotation instead of failing the run.

## Running

```
npm run test:appearance                      # build + full matrix
npx playwright test --config=e2e/appearance/playwright.appearance.config.ts   # reuse the existing dist
APPEARANCE_WORKERS=4 npm run test:appearance # cap parallelism (default 75% of cores)
```

The JSON report is written to `test-results/appearance-matrix.json`. The main `npm run test:e2e` config ignores this folder.

## Runtime and scaling

Each combination takes roughly 6-10 s (5 page states); the layout sub-matrix adds `distinct layout combos x 3` shorter tests. Runtime grows multiplicatively: `N = product(values per axis)` full tests. When the cross-product gets large, lower `APPEARANCE_WORKERS` if the machine struggles, or narrow with `-g "<key fragment>"` (test titles are the slash-joined axis values, e.g. `-g "light/high"`).

Text-contrast sampling resolves a single solid backdrop by walking ancestors; it cannot see content painted behind an element by a sibling/overlay, so treat marginal results near a threshold as leads to verify visually.
