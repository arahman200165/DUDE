# AGENTS.md — apps/web/src/app/core/pwa/

Installed-PWA support for the web companion (DUDE_PRD.md §21 Phase 26 Item 9). Inert on desktop.

- `pwa-install.service.ts`: captures `beforeinstallprompt` (plus an early copy stashed by `apps/web/src/index.html`, since it can fire before Angular boots) for DUDE's own "Install app" button in Settings › Web & Offline and a one-time Deck hint. It never prompts without a click.
- `pwa-launch.service.ts`: the `launchQueue` consumer for the manifest's `file_handlers`. It uses the same extension → tool mapping and `TextInputHandoffService` prefill as desktop Explorer "Open with".
- `apps/web/public/manifest.webmanifest` is **generated** by `scripts/generate-web-manifest.mjs` (part of `npm run generate:registry`). Never hand-edit it; `web-manifest.spec.ts` and CI's drift check catch it.
  - Shortcuts come from each tool's `pwaShortcut: { order }` (at most 10).
  - `file_handlers` come from `desktopOpen.extensions`.
  - `protocol_handlers` maps `web+dude://` → `/open-link`, which feeds `DeepLinkService.accept`, the same strict parser and confirm-before-run rules as desktop `dude://`.
- Icons: the PNGs are `purpose: any`. `apps/web/public/icons/icon-maskable.svg` is the full-bleed maskable variant, with the glyph inside the 80% safe zone.
