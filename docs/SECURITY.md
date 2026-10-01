# Security

DUDE is a local-first, client-side app: by default, everything you paste, upload, or generate stays in your browser tab (or, on desktop, on your machine) and is never sent anywhere. This document is the concrete, current-state accounting of the handful of places that isn't strictly true, what gets stored and where, the sandbox execution model's guarantees and limits, the Electron desktop app's process/IPC boundaries, and how to report a vulnerability.

See [`README.md`](../README.md) for the product overview and the master [PRD](DUDE_PRD.md), plus [Large Inputs](product/PRODUCT_SPEC.md#large-inputs), [Sensitive Inputs](architecture/SECURITY_ARCHITECTURE.md#sensitive-inputs) and [Security Boundaries](architecture/SECURITY_ARCHITECTURE.md#security-boundaries) for the underlying product requirements (Large Inputs, Sensitive Inputs, Security Boundaries) this document reports the current implementation of.

## What leaves the device

Nothing, by default. The four tools below and the desktop-only network diagnostics are the only exceptions. Each requires an explicit user action per use; none of them calls out automatically or in the background:

- **JWT Signature Verifier** (`/tools/jwt-verify`) — in JWKS mode, fetches the JWKS URL you supply (`jose`'s `createRemoteJWKSet`), or, if you pick a named preset (Auth0, Okta, Azure AD, Google), first fetches that provider's `.well-known/openid-configuration` discovery document to find its `jwks_uri`. In every case, the only thing that leaves your browser is a GET request to a URL you provided or explicitly selected — never the JWT itself, never its payload.
- **Text Inspector** (`/tools/text-inspector`) — its grammar-check mode sends the text you're checking to the public LanguageTool API (`https://api.languagetool.org/v2/check`) via a manual "Check" button, not live-as-you-type. This is the one tool where pasted content itself is transmitted; don't use it on text you don't want a third-party service to see.
- **Advanced Markdown Workspace** (`/tools/markdown-workspace`) — its Link Checker panel sends a HEAD request (falling back to GET if the server rejects HEAD) to every `http(s)` URL found in the document, via a manual "Check links" button, never automatically. Only the link URLs themselves leave the browser — nothing else about the document. Expect this to fail for many third-party sites that don't send CORS headers; those are reported as "couldn't check" rather than "broken," since the browser's Fetch API can't distinguish a CORS-blocked live link from a genuinely dead one.
- **Package Metadata Inspector** (`/tools/package-metadata-inspector`) — sends the package name you enter to the public registry API for the ecosystem you pick (npm's `registry.npmjs.org`, PyPI's `pypi.org`, crates.io's `crates.io/api`, or NuGet's `api.nuget.org`), via a manual "Look up" button. Only the package name and chosen ecosystem leave the browser. Maven Central is not offered as an ecosystem choice — neither its search API nor its raw repository file server sends a permissive CORS header, so a browser-side `fetch` can't read the response, and this architecture has no backend to proxy it through.

- **Desktop network diagnostics** (Ping, Traceroute, DNS Lookup, Reverse DNS, DNS Propagation, TCP/UDP Port Testers, Port Scanner, Public IP, Hostname Resolver, WHOIS, TCP/HTTP Connectivity, Continuous Ping, Packet Loss, MTU Discovery, Route Comparison, and Diagnostic Bundle) — desktop app only; on the web these routes show a desktop handoff and make no request. Each contacts only the target, resolver, or service listed for it in the generated [`SECURITY.md`](../SECURITY.md) network table, and only after you click Run. Public IP contacts `api.ipify.org`/`api6.ipify.org`, DNS Propagation queries Cloudflare, Google, and Quad9 plus any custom resolver you add, and WHOIS contacts IANA's RDAP bootstrap or `whois.iana.org`. The TCP/HTTP Connectivity Tester sends your headers and body to the URL you enter. Local Network makes no network request; it reads this machine's ports, connections, neighbors, routes, and interfaces.

Every other tool — including ones that look network-adjacent, like cURL Command Inspector or HTTP Status Code Reference — only parses, formats, or looks up against data bundled in the app itself.

## Camera access

**QR Code Scanner** and **Barcode Reader** can decode from a live webcam feed as an alternative to uploading an image. Camera access is never requested automatically — it starts only when you click "Use webcam" in either tool's shared camera component (`src/app/shared/components/camera-capture/`), the browser's own permission prompt governs whether it's granted, and you can revoke it at any time through your browser's site settings. Every video frame is decoded entirely client-side (`jsqr` for QR codes, `@zxing/library` for barcodes) — no frame, image, or decoded result is ever sent anywhere. Stopping the camera (or navigating away) releases the media stream immediately.

## What gets stored, and where

Every tool declares a persistence policy per piece of state (`ToolPersistencePolicy` on its `ToolDefinition`, enforced through `PersistenceService.signal()`), one of five tiers:

| Policy | Where | Survives | Used for |
| --- | --- | --- | --- |
| `none` | nowhere | — | sensitive input that should never touch disk (e.g. JWT Debugger's decoded token) |
| `session` | `sessionStorage` | until the tab closes | raw pasted input for most tools |
| `local` | `localStorage` | across sessions | UI preferences (mode, indent size, algorithm choice) |
| `user-choice` | user picks per-session | depends on choice | tools where persistence itself is sensitive enough to ask about (e.g. Python Playground) |
| `secure-local` | OS keychain via Electron `safeStorage` | across sessions, desktop-only | the LLM proxy API key set in Settings › AI / LLM Provider (`/settings`, a shell page — no longer a tool) — never written to `localStorage` even on desktop |

Desktop network diagnostics keep results in memory for the session. A result is written to disk only when you click **Save to History**: saved runs go to IndexedDB (`dude:v1:network-history`), without request headers, request bodies, downloaded HTTP bodies, or `Authorization`/`Proxy-Authorization`/`Set-Cookie` response headers. They are capped at 100 runs, 30 days, and 50 MB, and deleted by the tool's Delete and Clear controls or by clearing all data. Restoring a saved run never reruns it.

Nothing here is ever synced, uploaded, or visible to anyone but you on your own device/browser profile. There is no account system and no server-side storage of any kind.

## Sandboxed code execution

JavaScript Playground, Template Renderer, HTML Preview, and Python Playground all run untrusted, user-supplied code. Two different sandbox implementations back this, chosen by what each tool's execution model actually needs:

- **JS Playground and Template Renderer** share one sandbox (`src/app/shared/code-sandbox/`): an opaque-origin `<iframe sandbox="allow-scripts">` running a nested `Worker`, torn down and recreated (not just cleared) after every run, with a hard execution timeout. Template Renderer uses the identical sandbox because an EJS template compiles to real JavaScript internally — it's exactly as arbitrary as a JS Playground snippet, not a "safer" text-templating mode.
- **HTML Preview and Python Playground** each ship their own tool-local sandbox variant, because their execution models can't use a Worker — HTML Preview needs a live DOM to render into, and Python Playground (Pyodide/WebAssembly CPython) needs real `fetch`/WebAssembly access a Worker sandbox would block.

All four are network-isolated by policy (`network: { required: false }` — see each tool's `ToolDefinition`) and execute entirely client-side; nothing you run in any of them is sent anywhere. This is app-level sandboxing inside your existing browser security boundary, not a hardened jail: don't paste secrets into code you then execute, and treat it the way you'd treat any other in-browser code sandbox (CodePen, JSFiddle, a Jupyter-in-browser demo) — real, but not a substitute for not running code you don't trust in the first place.

## Electron desktop app

The Windows desktop build ([Phase 8](history/DELIVERY_HISTORY.md#phase-8)) adds a bundled local backend on top of the same web app, with the following boundaries:

- The renderer (the Angular app) runs with `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` — no direct Node.js or filesystem access, no exceptions. Every native capability (file dialogs, OS-keychain secret storage, the local LLM proxy, the collab server) is exposed only through `preload.ts`'s `contextBridge.exposeInMainWorld(...)`, never by relaxing those three flags.
- Every local backend process the desktop app starts — the static server serving the built app, the LLM proxy, the collab server — binds `127.0.0.1` (loopback) only, never an external network interface.
- **The one deliberate exception:** the local collaboration server (Advanced Markdown Workspace's real-time editing, Phase 8 Stage 6) binds `0.0.0.0` so it's reachable over your LAN by design, and is gated by a random per-session code so joining requires knowing that code. A self-hosted BYO relay (Stage 7, `relay/`) extends this across networks, but is never a DUDE-operated service — you run your own instance and point your own desktop app at it.
- The web app deployed to GitHub Pages has none of this backend — it remains the permanent, zero-install, fully browser-sandboxed entry point to DUDE.

None of Phase 25's desktop-shell native capabilities below are per-tool metadata (`generate-security-doc.mjs`'s tables above don't cover them), so each gets its own hand-written disclosure:

### Deep links (`dude://` protocol)

The `dude://` custom protocol (open a tool, workspace template, project, or pipeline; run a pipeline or Quick Run) is registered at install time via NSIS, and in a dev/unpackaged run via `app.setAsDefaultProtocolClient`. The main process forwards only the raw, length-capped, scheme-checked URL string from the OS to the renderer — all parsing and routing happens renderer-side (`core/deep-link/`). A `dude://run/...` link can never execute a pipeline or Quick Run on its own; it always routes through the same in-app confirmation click (`PipelineConfirmationService`) a manually-triggered run would.

### Native menu

The application menu's Tools submenu is built from a renderer-pushed snapshot of the tool registry (id, title, route, category only) sent over IPC whenever it changes — the main process never imports tool metadata directly (see `electron/AGENTS.md`'s type-only process boundary). A menu click only ever navigates to an already-known tool id or one of a small fixed set of built-in actions (Open File, Preferences, Command Palette, standard Electron menu roles).

### Quick Launcher

The global-hotkey Quick Launcher reuses the single main `BrowserWindow` rather than creating a second one. It only resizes/repositions that window when it was already hidden to the tray, restoring the prior bounds on dismiss, and never touches window geometry while the window is visible/focused. Selecting a pipeline from the launcher goes through the same confirmation gate as a deep link.

### Drag-and-drop routing

Dropping a file or folder anywhere in the desktop window is matched against the tool registry's `desktopOpen` declarations using the same ranked matcher the existing Explorer-association open flow already uses (`core/file-drop-detect/`), then routed through the same bounded file-reading path (extension allow-list, size cap) — it is never a second, less-checked way to open a file. A dropped directory is resolved to a real path via Electron's own `webUtils.getPathForFile()`, then handed to one narrowly-scoped `dude:open:enqueuePath` IPC handler that re-validates the path itself before doing anything with it.

### File-association registry writes

Installing the desktop app can optionally register a fixed, generated list of file extensions (drawn from every tool's own `desktopOpen.extensions`) under `HKCU`/`HKLM\Software\Classes`, so Windows Explorer offers "Open with DUDE." This is opt-in at install time (a checkbox on the installer's Explorer-actions page) and every registered extension only ever points back at the same DUDE executable with a `--open-with-dude <path>` argument — no other registry keys are touched. Settings shows which extensions were registered as install-time candidates and links to Windows' own Default Apps settings to actually change them; DUDE has no mechanism of its own to change your OS-level default-app assignment after install.

### Native File Recent List

Only files opened through the `--open-with-dude`/Explorer-association flow are ever recorded — never a tool's own file input — and only as `{path, name, extension, openedAt}`, never file content. Reopening a recent file re-reads it from disk through the same bounded path a fresh open already takes; nothing is ever served from a cached copy. Settings offers an opt-out toggle, a per-entry remove, and a clear-all; opting out only stops future recordings and never retroactively deletes history already accumulated.

### Crash/restart recovery

A small on-disk marker (`crash-state.json`, under Electron's `userData` directory) records only whether the previous shutdown was clean, flipped at app quit — nothing else is written there. If DUDE detects it was restored after an unclean exit (a crash, a force-kill, an OS shutdown) and a workspace was open, a dismissible notice says so. Restoring that workspace only ever re-applies each tool's own already-persisted, already-locally-stored state — the identical path a clean quit's next launch already takes — and never re-runs a tool's own action (a fetch, a write, a delete).

### Network diagnostics bridge

Phase 27's network tools reach the network only through `dude:network:*` IPC handlers (`electron/network-bridge.ts`). The main process re-validates every request, so a renderer cannot widen a limit: one host, or an IPv4/IPv6 CIDR of at most 16 addresses; at most 64 ports and 1,024 host × port × protocol probes per scan; 16 concurrent probes; 100 probes for Packet Loss; one hour for Continuous Ping; a 1 MB HTTP request body and 50 MB streamed response. At most four checks run at once. Port Scanner, the guided Diagnostic Bundle, and HTTP methods other than GET and HEAD first return a preview of the exact targets, ports, protocols, probe count, method, and header names. The run then needs a single-use confirmation token, bound to that window and to the unchanged request, which expires after 60 seconds. Cancelling, closing the window, or quitting aborts the job and closes its sockets and child processes. A job runs only while its window is open, and no check runs on a schedule.

Custom DNS servers use independent resolvers and never change Windows' DNS settings. DoH and DoT verify TLS certificates. HTTPS requests verify certificates by default. ICMP ping, trace, and MTU probes use a bundled `network-icmp.exe` helper (Windows ICMP API) that takes fixed arguments with no shell and returns bounded JSON. Local Network's ports, connections and processes views read the socket and process tables through the bundled `windows-sys.exe` helper (a closed, read-only method allowlist validated in main), and its neighbors, routes and interfaces views run fixed, read-only PowerShell 7 scripts whose arguments pass only as a base64-JSON parameter (PowerShell 7 is required). **Relaunch as Administrator** is offered only as a deliberate button. It asks Windows for elevation (UAC), and the app closes only if you accept. An elevated session is marked in the tool. No check reruns after a relaunch or a refused prompt.

## Third-party dependencies

DUDE is library-forward by design (see `README.md`'s Tech stack section) rather than hand-rolling fiddly logic like color-space math or CRDT sync. Keeping that dependency surface current is an ongoing, automated process rather than a static list here (which would go stale immediately): every push and PR runs `npm audit --audit-level=high` against production dependencies, a weekly CodeQL scan analyzes the codebase for common vulnerability patterns, and Dependabot opens weekly update PRs for both npm packages and GitHub Actions. See `.github/workflows/deploy.yml`, `.github/workflows/codeql.yml`, and `.github/dependabot.yml`.

## Reporting a vulnerability

Please use GitHub's private security advisory reporting for this repository (the repo's **Security** tab → **Report a vulnerability**) rather than opening a public issue. This lets us assess and fix an issue before it's publicly disclosed.
