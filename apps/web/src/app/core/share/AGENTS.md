# AGENTS.md — apps/web/src/app/core/share/

Shareable Tool Routes (DUDE_PRD.md §21 Phase 26 Item 12). Tool-agnostic: a tool becomes shareable-with-input purely by declaring a text input (`fileInput`, or `desktopOpen.inputKey`, via `textFileInputOf`), with no per-tool code.

- `share-link-codec.ts` is the pure `#in=v1.<base64url(deflate-raw)>` codec. It caps encoding at 8 KB. Decoding caps output at 1 MB and never throws.
- `share-link.service.ts` builds bare links (`linkFor`), builds links with input (`linkWithInputFor`), and receives them (`receive`).
- `share-command-source.ts` adds the palette's "Copy Link to <tool>", bare links only.
- The receiver is the `shareLinkReceiver` guard in `core/registry/tool-routes.ts`. It runs before the component constructs, then redirects to the same URL minus the fragment.

## Rules

- **Fragment, never query.** A `?query` reaches GitHub Pages' server logs, while a `#fragment` never leaves the browser. Don't move shared input into query params.
- **Embedding input is always its own explicit action**, with its warning visible (ToolShell's Share menu). The bare "Copy link" never carries data, and neither does the palette command.
- **The receiver never auto-runs.** It only writes through the tool's own declared persistence policy. It flags the text as imported (`recordImportedFileFlags`), so code-running tools gate it exactly like an opened file. It shows a "Loaded from link" notice. No network call, no save beyond the tool's policy, no execution.
- **Never a secret tier.** Shareable inputs are `session`/`user-choice` only (`ToolFileInput.policy`'s type), and `share-link.service.spec.ts` asserts it registry-wide.
- Desktop links point at the public web companion (`WEB_COMPANION_BASE_URL`), never the desktop app's private loopback server.
