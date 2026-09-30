<p align="center">
  <img src="DUDE_logo_primary.svg" alt="DUDE — Developer Utility Dashboard Engine" width="480" />
</p>

# DUDE — Developer Utility Dashboard Engine

[![Deploy](https://github.com/arahman200165/DUDE/actions/workflows/deploy.yml/badge.svg)](https://github.com/arahman200165/DUDE/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/demo-live-22c55e)](https://arahman200165.github.io/DUDE/)
[![License: MIT](https://img.shields.io/badge/License-MIT-3b82f6.svg)](LICENSE)
[![Security Policy](https://img.shields.io/badge/security-policy-informational)](docs/SECURITY.md)

A dense, dark-first, themeable developer workbench for JSON, regex, JWT, hashing, diffing, and hundreds of other utilities. The Windows desktop app is the canonical experience; an installable, offline-capable web companion works without a download.

**[→ Open the live app](https://arahman200165.github.io/DUDE/)**

---

## What is DUDE

DUDE is not a race to ship the most tools. It's a framework built to make adding **tool 36, 37, or 45** routine instead of architectural work — a new simple utility with existing transformation logic can be added in **under 30 minutes**, without touching navigation, routing, search, the command palette, persistence, or the PWA layer. Milestone 10's timed proof (see [`ADDING_A_TOOL.md`](ADDING_A_TOOL.md)) added a full tool, tests included, in **2 minutes 50 seconds** — a claim then validated at scale across Milestone 11's 8-tool batch, Milestone 12's structured-data batch, and Milestone 13's web/API batch, which added two new shared UI primitives (`app-copy-button`, `app-key-value-editor`) without touching the shell.

Most transforms run locally in the browser or desktop renderer. Native desktop features use a bundled local backend; network-enabled tools disclose when they contact external services. DUDE has no account or telemetry service.

- **Local-first** — browser-safe tools work offline once their code and optional runtimes are cached; network-dependent modes and desktop-only features are clearly marked.
- **Dense, not decorative** — bold, functional color-coding by category and status, built for daily use, not for demos.
- **Dark by default, yours to tune** — Settings › Appearance offers Dark / Light / System themes, high contrast, six accents, Vivid / Soft / Color-blind-safe category palettes, color-blind-safe status colors, three densities, UI and data font choices, and reduced motion. Every option is first-party and contrast-checked in every combination; there are no free color pickers or user-authored themes.
- **Framework-first** — the registry, shell, persistence, and worker layers were built before the tools, so new tools are cheap and safe to add.

The tools are the proof, not the point: DUDE is a **local-first, extensible developer workbench** for transforming, inspecting, and composing developer data — not just a growing pile of independent utilities. Every tool declares what it accepts and produces in a small shared vocabulary (`DudeDataType` — see `src/app/shared/models/tool-io.model.ts`), and most tools can now be chained into a reusable **Transformation Pipeline** (`/pipelines`) instead of copying output to input by hand — including a user-defined script step, running in the same sandbox as the JS Playground, for a custom transform that isn't one of the built-in tools. **Smart Paste** (`/smart-paste`) recognizes a pasted JSON blob, JWT, UUID, ULID/KSUID/Snowflake id, URL, Unix timestamp, hex color, IP address, or Base64 string and jumps straight to (and prefills) the tool that understands it.

## Screenshots

| Deck | JSON Formatter |
| --- | --- |
| ![DUDE deck, showing the sidebar and color-coded category grid](docs/screenshots/deck.jpg) | ![JSON Formatter tool, pretty-printing a sample JSON object](docs/screenshots/json-formatter.jpg) |

## Desktop app

Per `DUDE_PRD.md` §4.9, the Windows desktop app (`DUDE_PRD.md` §21 Phase 8) is the canonical DUDE workbench — the same Angular codebase, packaged as a standalone Electron app with native capabilities a browser sandbox can't offer.

Download the latest installer from the repo's [GitHub Releases](https://github.com/arahman200165/DUDE/releases) page. The NSIS `.exe` requests administrator permission at launch, then offers Express presets (Minimal, Standard, Fully Integrated) or a Custom wizard for install scope/path, shortcuts, Explorer actions, and individual file-type registration. A resumable first-launch wizard covers desktop, update, notification, hotkey, AI, and tool-contributed settings (such as the collaboration relay); Settings › General can reopen it later. Windows requires default file apps to be confirmed in Default Apps settings after registration. Manual `.exe` reinstalls repeat both wizards with saved values, while silent auto-updates preserve choices. The MSIX uses its platform-managed setup. See [Windows setup and onboarding](docs/WINDOWS_SETUP.md) for the full preset matrix, file associations, and verification checklist. `.github/workflows/version-bump.yml` and `.github/workflows/release.yml` (separate from the GitHub Pages `deploy.yml`) automate the whole cut-a-release pipeline, running on a `windows-latest` CI runner.

Don't want to install anything? **[→ Open the zero-install web companion](https://arahman200165.github.io/DUDE/)** — it runs the same tools directly in your browser, no download required, covering every capability that's safe to run in a browser sandbox (see [PWA & Offline](#pwa--offline) below for what works without a network connection).

All 8 stages of the desktop-packaging phase are shipped:

- **Native file access** — Directory Diff and Git Repo Browser use a native folder picker + live, re-scannable filesystem access instead of `<input webkitdirectory>`, via a sandboxed preload/IPC bridge.
- **OS-level secret storage** — a `secure-local` persistence tier backed by Electron `safeStorage` (OS keychain).
- **Local LLM proxy + AI regex features** — Regex Tester gains natural-language-to-regex generation and an AI-assisted explanation, backed by a localhost-only proxy to a user-configured OpenAI-compatible endpoint (base URL/model/key set in Settings › AI / LLM Provider); the existing rule-based explainer stays as the offline/web fallback.
- **Desktop shell chrome** — a system tray (closing the window minimizes to it), launch-on-login, native notifications, and a global-hotkey clipboard quick-action registry (Base64 encode/decode, UUID generate, SHA-256 hash).
- **Real-time collaboration** — Advanced Markdown Workspace can host or join a same-machine/LAN session (a local Yjs-based collab server, LAN-reachable by design with a required per-session code) or, via a self-hosted relay (`relay/`, ships with its own `Dockerfile` — DUDE itself never runs one for you), collaborate across networks.
- **Auto-update + distribution** — every push to `master` automatically bumps the patch version, tags it, and cuts a new GitHub Release carrying an unsigned NSIS installer and an MSIX/appx package (`electron-builder.yml`); the running desktop app checks that release feed via `electron-updater`, uses your selected automatic-download, check-and-notify, or manual-check policy, and only installs it once you click "Restart & Install" — never silently. The MSIX currently ships with placeholder Microsoft Store package-identity values and isn't Store-submittable yet.

**Network diagnostics** (`DUDE_PRD.md` §21 Phase 27) are desktop-only. The toolkit covers Ping, Traceroute, DNS Lookup and Reverse DNS (classic DNS, DoH, DoT), DNS Propagation, TCP/UDP Port Testers, a bounded Port Scanner, a Local Network viewer (ports, connections, listening processes, neighbors, routes, interfaces), Public IP, Hostname Resolver, WHOIS/RDAP, TCP/HTTP Connectivity, Continuous Ping, Packet Loss, MTU Discovery, Route Comparison, and a reviewed Diagnostic Bundle ZIP export. Checks start only when you click Run, and the Electron main process enforces the limits. Scans and HTTP methods that can change server state show a preview and need a separate confirmation. Results stay in memory unless you save one to History. ICMP probes use a small bundled Windows helper (`native/network-icmp.cpp`, built by `npm run electron:helper`). Local Network's ports, connections and processes views read sockets from the `windows-sys` helper described below; its neighbors, routes and interfaces views run fixed PowerShell 7 scripts and need PowerShell 7 installed. On the web, these routes stay discoverable and hand off to the desktop app. See [Security](docs/SECURITY.md#network-diagnostics-bridge) for limits and disclosures.

**DNS & live TLS / certificate tools** (`DUDE_PRD.md` §21 Phase 28) build on the same bridge: DNS Lookup and DNS Propagation gained DNSSEC records, CAA analysis, the full record-type set and a resolver comparator; a DNSSEC Inspector validates the chain of trust locally from the embedded IANA root anchors; an Email Auth Inspector covers SPF/DKIM/DMARC; the TLS Connection Inspector reports version/cipher/ALPN/SNI, a handshake timeline, mTLS, HTTP/3, gated cipher enumeration and an elevated pktmon capture; a Live Certificate Chain Fetcher, Revocation Inspector (OCSP/CRL/AIA), Certificate Transparency Lookup, STARTTLS Inspector and HTTPS Configuration Analyzer round out live inspection; and a Certificate Watch List runs opt-in background expiry checks while DUDE is open. Certificates are validated against both the Mozilla and Windows trust stores. Bundled reference data (Public Suffix List, CT log list under `electron/data/`) is refreshed by `scripts/refresh-network-data.mjs` and never fetched at runtime.

**Filesystem & binary forensics** (DUDE_PRD.md section 21, Phase 29) is desktop-only. A native picker grants a folder for the current session; users can explicitly remember or revoke it. A separate Electron utility process streams cancellable walks, hashes and searches. Folder Size Analyzer, Directory Tree Generator, Hash Manifest & Snapshot, Duplicate Files, Tree Search, Batch Rename, Batch Text Converter, File Split & Join and Large-File Inspector share that foundation. Every change to a user file goes through a previewed mutation plan, a 60-second single-use confirmation, precondition checks, and a journal with previewed undo; deletes use the Recycle Bin. Batch Operations shows the journal and backup retention. Watched Folders & Change Timeline runs only while DUDE is open, only for explicitly remembered roots, with optional per-root content capture. Directory Diff and Git Repo Browser can opt into auto-rescan while open. These routes remain discoverable on the web and show desktop-only controls.

**Windows & process tools** (`DUDE_PRD.md` §21 Phase 31) are desktop-only and turn the desktop app into a Windows troubleshooting workbench, not a system-administration suite. They cover a Process Viewer with actions, Port → Process Lookup, Environment Variables, PATH Editor, Runtime Detector, Registry Editor, Services Viewer, Event Log Viewer, Scheduled Tasks, Startup Programs, Installed Software, Windows Features, Dependency Walker (plus a richer PE Header Viewer), SID & Account Resolver, ACL Inspector, File Lock Inspector, PowerShell Builder, and a Process Diagnostic Bundle. Most reads go through `windows-sys.exe`, one long-lived native helper (`native/windows-sys/*.cpp`, built by `npm run electron:helper`, shipped in `extraResources`) that speaks JSON lines for processes, handles, ports, registry, services, the event log, SIDs/ACLs, Restart Manager, the API-set map and minidumps. The rarer data (scheduled tasks, Windows features, Store/Appx packages, Local Network neighbors/routes/interfaces) and the PowerShell Builder need **PowerShell 7** (`pwsh`), for example `winget install --id Microsoft.PowerShell`; without it the affected views show a "PowerShell 7 required" notice and everything else keeps working. Tools run with your current permissions first and mark rows that need administrator rights; **Relaunch as Administrator** is a deliberate action, and nothing reruns after a relaunch. Every change goes through a previewed plan, a 60-second single-use confirmation, apply-time precondition checks and a journal (typed-name confirmation is enforced for critical processes and services). The **System Changes** route lists that journal with per-change outcomes and previewed undo for reversible changes, plus the snapshot library behind the environment, PATH and registry diffs. On the web, these routes remain discoverable and show desktop-only controls.

```bash
npm run electron:dev     # hot-reload desktop dev, points Electron at a live `ng serve`
npm run electron:start   # full build -> compile -> launch, closest to a real install
npm run electron:package # build -> compile -> electron-builder (NSIS + MSIX), local packaging
npm run relay:dev        # run the standalone BYO collab relay locally
```

Electron's `BrowserWindow` loads the built app from a small local static server bound to `127.0.0.1` on an OS-assigned port (never an external interface), not `file://` — so the existing path-based routing works unchanged, with real SPA fallback instead of the GitHub Pages `404.html` trick. The renderer keeps `contextIsolation` on with no direct `nodeIntegration`; all native access is mediated through `electron/preload.ts`'s `contextBridge` bridge — see `electron/AGENTS.md` for that rule and `src/app/core/platform/` for the `PlatformService` tools/shell code can use to detect the desktop runtime. The one deliberate exception to the loopback-only rule is the local collab server, which binds `0.0.0.0` for LAN reachability, gated by a random per-session code.

### Web vs. desktop capability matrix

Generated from each tool's `capabilities` manifest metadata (`scripts/generate-security-doc.mjs`) — do not hand-edit.

<!-- capability-matrix:start -->
Every tool not listed here behaves identically on the web companion and the desktop app.

| Tool | Desktop capability | On the web | What desktop adds |
| --- | --- | --- | --- |
| [ACL Inspector](https://arahman200165.github.io/DUDE/tools/acl-inspector) | Native filesystem access | Desktop-only feature | uses a native picker to grant a file or folder for ACL inspection and editing |
| [ACL Inspector](https://arahman200165.github.io/DUDE/tools/acl-inspector) | Native Windows system access | Desktop-only feature | reads security descriptors for native file, folder and registry targets |
| [ACL Inspector](https://arahman200165.github.io/DUDE/tools/acl-inspector) | Native Windows system changes | Desktop-only feature | edits the DACL of one file, folder or registry key through the desktop system mutation engine (never the owner or audit rules) |
| [Batch Operations](https://arahman200165.github.io/DUDE/tools/batch-operations) | Native filesystem write | Desktop-only feature | undoes journaled file changes through the desktop mutation engine |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Native filesystem access | Desktop-only feature | lists real folders in the desktop fs worker |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Native filesystem write | Desktop-only feature | renames only through a previewed, journaled, undoable plan |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Native filesystem access | Desktop-only feature | reads real folders and re-encodes with iconv-lite in the desktop fs worker |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Native filesystem write | Desktop-only feature | rewrites files only through a previewed, loss-checked, undoable plan |
| [Certificate Watch List](https://arahman200165.github.io/DUDE/tools/certificate-watch-list) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Certificate Transparency Lookup](https://arahman200165.github.io/DUDE/tools/ct-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Dependency Walker](https://arahman200165.github.io/DUDE/tools/dependency-walker) | Native filesystem access | Desktop-only feature | opens the selected executable through the desktop file picker |
| [Dependency Walker](https://arahman200165.github.io/DUDE/tools/dependency-walker) | Native Windows system access | Desktop-only feature | resolves Windows DLL dependencies using live operating-system search context in Desktop DUDE |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | File watching | Desktop-only feature | optionally rescans open folders when their contents change |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | Native filesystem access | Works — weaker browser fallback | compares real folders on disk, not zipped/pasted file lists |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Native filesystem access | Desktop-only feature | walks real folders on disk in the desktop fs worker |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Native filesystem write | Desktop-only feature | writes the generated tree into the folder only through a previewed, confirmed plan |
| [DNS Lookup](https://arahman200165.github.io/DUDE/tools/dns-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [DNS Propagation Tester](https://arahman200165.github.io/DUDE/tools/dns-propagation) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [DNSSEC Inspector](https://arahman200165.github.io/DUDE/tools/dnssec-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Native filesystem access | Desktop-only feature | scans and hashes real folders and drives in the desktop fs worker |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Native filesystem write | Desktop-only feature | moves selected extra copies to the Recycle Bin through a previewed, journaled plan |
| [Email Auth Inspector](https://arahman200165.github.io/DUDE/tools/email-auth-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Environment Variables](https://arahman200165.github.io/DUDE/tools/environment-variables) | Native Windows system access | Desktop-only feature | reads the user, machine and volatile environment from the registry through the desktop system helper |
| [Environment Variables](https://arahman200165.github.io/DUDE/tools/environment-variables) | Native Windows system changes | Desktop-only feature | adds, edits and deletes environment variables through the desktop system mutation engine |
| [Event Log Viewer](https://arahman200165.github.io/DUDE/tools/event-log-viewer) | Native filesystem access | Desktop-only feature | grants the .evtx file you choose to open |
| [Event Log Viewer](https://arahman200165.github.io/DUDE/tools/event-log-viewer) | Native Windows system access | Desktop-only feature | reads event log channels and events through the desktop system helper |
| [File Lock Inspector](https://arahman200165.github.io/DUDE/tools/file-lock-inspector) | Native filesystem access | Desktop-only feature | uses a native picker to grant the file or folder to inspect |
| [File Lock Inspector](https://arahman200165.github.io/DUDE/tools/file-lock-inspector) | Native Windows system access | Desktop-only feature | lists lock owners through Restart Manager and, when elevated, scans process handles through the desktop system helper |
| [File Lock Inspector](https://arahman200165.github.io/DUDE/tools/file-lock-inspector) | Native Windows system changes | Desktop-only feature | releases a lock through a graceful Restart Manager shutdown or restart, or ends the owner process, via the desktop system mutation engine |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Native filesystem access | Desktop-only feature | reads real files and part folders in the desktop fs worker |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Native filesystem write | Desktop-only feature | writes parts and joined files only through a previewed, verified, journaled plan |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Native filesystem access | Desktop-only feature | scans real folders and drives in the desktop fs worker |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Native filesystem write | Desktop-only feature | moves selected items to the Recycle Bin through a previewed, journaled plan |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | File watching | Desktop-only feature | optionally refreshes the worktree and git metadata when they change |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | Native filesystem access | Works — weaker browser fallback | reads a real .git directory on disk, no upload/zip step |
| [Hash Manifest & Snapshot](https://arahman200165.github.io/DUDE/tools/hash-manifest) | Native filesystem access | Desktop-only feature | streams and hashes whole folders in the desktop fs worker |
| [Hostname Resolver](https://arahman200165.github.io/DUDE/tools/hostname-resolver) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Installed Software](https://arahman200165.github.io/DUDE/tools/installed-software) | Native Windows system access | Desktop-only feature | reads uninstall registry entries and installed Appx packages on Windows |
| [Installed Software](https://arahman200165.github.io/DUDE/tools/installed-software) | Native Windows system changes | Desktop-only feature | launches a registered interactive vendor uninstaller after a reviewed no-undo system plan |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | File watching | Desktop-only feature | follows a growing file (tail -f) |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | Native filesystem access | Desktop-only feature | reads byte ranges and streams search over files of any size on disk |
| [Continuous Ping / Latency Graph](https://arahman200165.github.io/DUDE/tools/latency-monitor) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Live Certificate Chain Fetcher](https://arahman200165.github.io/DUDE/tools/live-certificate-chain) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Local Network Viewer](https://arahman200165.github.io/DUDE/tools/local-network) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Collaboration relay | Desktop-only feature | collaborate across networks via a self-hosted relay |
| [MTU Discovery](https://arahman200165.github.io/DUDE/tools/mtu-discovery) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Packet-Loss Measurement](https://arahman200165.github.io/DUDE/tools/packet-loss) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [PATH Editor](https://arahman200165.github.io/DUDE/tools/path-editor) | Native Windows system access | Desktop-only feature | reads the PATH from the registry and checks its directories through the desktop system helper |
| [PATH Editor](https://arahman200165.github.io/DUDE/tools/path-editor) | Native Windows system changes | Desktop-only feature | saves the user or machine PATH through the desktop system mutation engine |
| [Ping](https://arahman200165.github.io/DUDE/tools/ping) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Port → Process Lookup](https://arahman200165.github.io/DUDE/tools/port-process-lookup) | Native Windows system access | Desktop-only feature | reads the TCP and UDP socket tables and running processes through the desktop system helper |
| [Port → Process Lookup](https://arahman200165.github.io/DUDE/tools/port-process-lookup) | Native Windows system changes | Desktop-only feature | ends the process that owns a port through the desktop system mutation engine |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [PowerShell Builder](https://arahman200165.github.io/DUDE/tools/powershell-builder) | Native Windows system access | Desktop-only feature | reads the PowerShell 7 cmdlet catalog (Get-Command metadata) in Desktop DUDE |
| [PowerShell Builder](https://arahman200165.github.io/DUDE/tools/powershell-builder) | Native Windows system changes | Desktop-only feature | runs a reviewed PowerShell script (which may change anything the account can) after a previewed, single-use confirmation in Desktop DUDE |
| [Process Diagnostic Bundle](https://arahman200165.github.io/DUDE/tools/process-diagnostic-bundle) | Native filesystem access | Desktop-only feature | the native save dialog grants the one ZIP file the bundle is written to |
| [Process Diagnostic Bundle](https://arahman200165.github.io/DUDE/tools/process-diagnostic-bundle) | Native Windows system access | Desktop-only feature | reads the process, its Event Log entries and a minidump through the desktop system helper, then writes the ZIP from the main process |
| [Process Viewer](https://arahman200165.github.io/DUDE/tools/process-viewer) | Native filesystem access | Desktop-only feature | grants the folder a crash dump is written into |
| [Process Viewer](https://arahman200165.github.io/DUDE/tools/process-viewer) | Native Windows system access | Desktop-only feature | reads running processes and their details through the desktop system helper |
| [Process Viewer](https://arahman200165.github.io/DUDE/tools/process-viewer) | Native Windows system changes | Desktop-only feature | ends, restarts, suspends, reprioritises and dumps processes through the desktop system mutation engine |
| [Public IP Detector](https://arahman200165.github.io/DUDE/tools/public-ip) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Regex Tester](https://arahman200165.github.io/DUDE/tools/regex) | Local LLM proxy | Desktop-only feature | AI-assisted explain/generate via a local LLM proxy, no cloud key required |
| [Registry Editor](https://arahman200165.github.io/DUDE/tools/registry-editor) | Native Windows system access | Desktop-only feature | enumerates, searches and exports registry keys through the desktop system helper |
| [Registry Editor](https://arahman200165.github.io/DUDE/tools/registry-editor) | Native Windows system changes | Desktop-only feature | creates keys and sets or deletes values through the desktop system mutation engine |
| [Reverse DNS Lookup](https://arahman200165.github.io/DUDE/tools/reverse-dns) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Certificate Revocation Inspector](https://arahman200165.github.io/DUDE/tools/revocation-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Route Comparison](https://arahman200165.github.io/DUDE/tools/route-comparison) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Runtime Detector](https://arahman200165.github.io/DUDE/tools/runtime-detector) | Native Windows system access | Desktop-only feature | reads PATH, registry install keys and executable file versions through the desktop system helper; the optional version probe runs discovered programs on an explicit, previewed action |
| [Scheduled Tasks](https://arahman200165.github.io/DUDE/tools/scheduled-tasks) | Native Windows system access | Desktop-only feature | reads scheduled tasks through a fixed PowerShell 7 script in the desktop app |
| [Scheduled Tasks](https://arahman200165.github.io/DUDE/tools/scheduled-tasks) | Native Windows system changes | Desktop-only feature | enables or disables tasks through the desktop system mutation engine |
| [Services Viewer](https://arahman200165.github.io/DUDE/tools/services-viewer) | Native Windows system access | Desktop-only feature | lists services and reads their configuration and dependencies through the desktop system helper |
| [Services Viewer](https://arahman200165.github.io/DUDE/tools/services-viewer) | Native Windows system changes | Desktop-only feature | starts, stops, restarts and reconfigures services through the desktop system mutation engine |
| [SID & Account Resolver](https://arahman200165.github.io/DUDE/tools/sid-account-resolver) | Native Windows system access | Desktop-only feature | resolves Windows SIDs and reads the current token, local accounts, groups and user profiles on Desktop DUDE |
| [STARTTLS Inspector](https://arahman200165.github.io/DUDE/tools/starttls-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Startup Programs](https://arahman200165.github.io/DUDE/tools/startup-programs) | Native Windows system access | Desktop-only feature | inspects local Windows startup registrations through the desktop system helper |
| [Startup Programs](https://arahman200165.github.io/DUDE/tools/startup-programs) | Native Windows system changes | Desktop-only feature | changes supported StartupApproved states through the desktop system mutation engine |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Native Windows system access | Desktop-only feature | manages the local snapshot library used by the environment, PATH and registry diffs |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Native Windows system changes | Desktop-only feature | undoes journaled Windows system changes through the desktop system mutation engine |
| [TCP Port Tester](https://arahman200165.github.io/DUDE/tools/tcp-port-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Traceroute](https://arahman200165.github.io/DUDE/tools/traceroute) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Native filesystem access | Desktop-only feature | searches real folders in the desktop fs worker |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Native filesystem write | Desktop-only feature | replaces across files only through a previewed, per-hunk, journaled plan |
| [UDP Port Tester](https://arahman200165.github.io/DUDE/tools/udp-port-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | File watching | Desktop-only feature | watches remembered folders in the desktop main process, including while hidden to the tray |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | Native filesystem access | Desktop-only feature | picks and remembers the folders to watch |
| [WHOIS Lookup](https://arahman200165.github.io/DUDE/tools/whois-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Windows Features](https://arahman200165.github.io/DUDE/tools/windows-features) | Native Windows system access | Desktop-only feature | reads Windows optional features and capabilities through PowerShell 7 in Desktop DUDE |
| [Windows Features](https://arahman200165.github.io/DUDE/tools/windows-features) | Native Windows system changes | Desktop-only feature | enables or disables optional features through the previewed desktop system mutation engine |

Optional runtimes are cached on demand by the web service worker the first time the tool needs
them (never prefetched), and ship locally inside the desktop app.

| Tool | Optional runtime |
| --- | --- |
| [Python Playground](https://arahman200165.github.io/DUDE/tools/python-playground) | Pyodide (Python/WASM) |
| [SQLite File Viewer](https://arahman200165.github.io/DUDE/tools/sqlite-viewer) | sql.js (SQLite/WASM) |
| [Template Renderer](https://arahman200165.github.io/DUDE/tools/template-renderer) | EJS template engine |
| [XML Schema / XSD Validator](https://arahman200165.github.io/DUDE/tools/xml-xsd-validator) | xmllint (libxml2/WASM) |
<!-- capability-matrix:end -->

## Tools

333 tools ship today, each self-registered in [`tool-definitions.ts`](src/app/core/registry/tool-definitions.ts) — nothing about the shell knows any tool by name.

| Tool | Category | What it does |
| --- | --- | --- |
| [Avro Viewer](https://arahman200165.github.io/DUDE/tools/avro-viewer) | Data | Decode an uncompressed Avro Object Container File and inspect its records. |
| [BSON Viewer](https://arahman200165.github.io/DUDE/tools/bson-viewer) | Data | Decode a BSON file and inspect its structure. |
| [CBOR Viewer](https://arahman200165.github.io/DUDE/tools/cbor-viewer) | Data | Decode a CBOR file and inspect its structure. |
| [CREATE TABLE Generator](https://arahman200165.github.io/DUDE/tools/create-table-generator) | Data | Infers column types from a pasted JSON array or CSV sample and generates dialect-specific CREATE TABLE DDL. |
| [CSV Cleaner](https://arahman200165.github.io/DUDE/tools/csv-cleaner) | Data | Trim whitespace, drop empty rows, and normalize a messy CSV. |
| [CSV Deduplicator](https://arahman200165.github.io/DUDE/tools/csv-dedupe) | Data | Remove duplicate rows from a CSV, optionally by a subset of key columns. |
| [CSV Delimiter Detector](https://arahman200165.github.io/DUDE/tools/csv-delimiter-detector) | Data | Detect the most likely delimiter in a pasted CSV/TSV/PSV sample and preview it as a table. |
| [CSV Filter / Sort](https://arahman200165.github.io/DUDE/tools/csv-filter-sort) | Data | Filter a CSV's rows by a column condition, and sort by a column. |
| [CSV Join / Merge](https://arahman200165.github.io/DUDE/tools/csv-join) | Data | Join two CSVs on a key column, inner or left. |
| [CSV Pivot](https://arahman200165.github.io/DUDE/tools/csv-pivot) | Data | Pivot a CSV: group by a row key and column key, aggregating a value column. |
| [CSV ↔ SQL Converter](https://arahman200165.github.io/DUDE/tools/csv-sql) | Data | Convert CSV rows or a JSON array of objects to SQL INSERT statements, or parse INSERT statements back into CSV. |
| [CSV Column Statistics](https://arahman200165.github.io/DUDE/tools/csv-stats) | Data | Compute per-column count, empty, distinct, and numeric min/max/mean statistics for a CSV. |
| [CSV Viewer / Converter](https://arahman200165.github.io/DUDE/tools/csv-viewer) | Data | View CSV as a table, and convert between CSV and JSON. |
| [INI Formatter / Parser](https://arahman200165.github.io/DUDE/tools/ini-formatter) | Data | Convert between INI and JSON, in either direction. |
| [JSON Formatter](https://arahman200165.github.io/DUDE/tools/json) | Data | Validate, format, and minify JSON, with an editable tree view, structural compare, and malformed-JSON repair. |
| [JSON Flatten / Unflatten](https://arahman200165.github.io/DUDE/tools/json-flatten) | Data | Flatten nested JSON into dot/bracket-notation path keys, or unflatten them back into nested JSON. |
| [JSON Merge](https://arahman200165.github.io/DUDE/tools/json-merge) | Data | Deep-merge two JSON documents, or apply an RFC 7396 JSON Merge Patch. |
| [JSON Patch Generator](https://arahman200165.github.io/DUDE/tools/json-patch-generate) | Data | Diff two JSON documents into an RFC 6902 JSON Patch. |
| [JSON Patch Tester](https://arahman200165.github.io/DUDE/tools/json-patch-test) | Data | Apply an RFC 6902 JSON Patch to a JSON document and see the result. |
| [JSON Pointer Tester](https://arahman200165.github.io/DUDE/tools/json-pointer) | Data | Resolve an RFC 6901 JSON Pointer against a JSON document. |
| [JSONPath / JMESPath Tester](https://arahman200165.github.io/DUDE/tools/json-query) | Data | Query JSON with a JSONPath or JMESPath expression. |
| [JSON Schema Validator](https://arahman200165.github.io/DUDE/tools/json-schema-validator) | Data | Validate a JSON instance against a Draft-07 or 2020-12 JSON Schema, with per-error paths. |
| [JSON Sort Keys](https://arahman200165.github.io/DUDE/tools/json-sort-keys) | Data | Sort a JSON document's object keys alphabetically, top-level or recursively. |
| [JSON Lines / NDJSON Viewer](https://arahman200165.github.io/DUDE/tools/jsonl-viewer) | Data | View newline-delimited JSON (NDJSON/JSON Lines) as a table or a JSON array. |
| [MessagePack Decoder](https://arahman200165.github.io/DUDE/tools/msgpack-decoder) | Data | Decode a MessagePack-encoded file and inspect its structure. |
| [Parquet Viewer](https://arahman200165.github.io/DUDE/tools/parquet-viewer) | Data | Decode a Parquet file and view its rows as a table. |
| [Properties File Parser](https://arahman200165.github.io/DUDE/tools/properties-parser) | Data | Convert between Java-style .properties files and JSON, in either direction. |
| [Protobuf Decoder](https://arahman200165.github.io/DUDE/tools/protobuf-decoder) | Data | Decode a Protobuf-encoded payload against a user-supplied .proto schema. |
| [Resx Tool](https://arahman200165.github.io/DUDE/tools/resx-tool) | Data | View, diff, merge, and extract format tokens from .NET .resx resource files. |
| [Schema Diff](https://arahman200165.github.io/DUDE/tools/schema-diff) | Data | Diffs two CREATE TABLE statements, reporting added, removed, and changed columns. |
| [SQL Dialect Converter](https://arahman200165.github.io/DUDE/tools/sql-dialect-converter) | Data | Converts SQL between PostgreSQL, MySQL, MariaDB, SQLite, and SQL Server, best-effort. |
| [SQL Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/sql-formatter-tool) | Data | Pretty-prints or minifies SQL across PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, and Oracle (PL/SQL) dialects. |
| [SQL Parameterizer](https://arahman200165.github.io/DUDE/tools/sql-parameterizer) | Data | Replaces literal values in a SQL query with placeholders (?, $n, or :named), extracting the values as a parameter list. |
| [SQL Query Explainer](https://arahman200165.github.io/DUDE/tools/sql-query-explainer) | Data | Breaks a SELECT statement down into a plain-English description of its columns, joins, filters, grouping, and ordering. Static and pattern-based — not a live EXPLAIN. |
| [SQL Syntax Checker](https://arahman200165.github.io/DUDE/tools/sql-syntax-checker) | Data | Checks SQL for syntax errors against a chosen dialect, reporting the error message and line/column. |
| [SQLite File Viewer](https://arahman200165.github.io/DUDE/tools/sqlite-viewer) | Data | Browse the tables in a SQLite file, read-only, entirely client-side. |
| [Universal Structured Data Converter](https://arahman200165.github.io/DUDE/tools/structured-data-converter) | Data | Convert between JSON, YAML, XML, TOML, and CSV, any format to any other. |
| [TOML Formatter / Validator](https://arahman200165.github.io/DUDE/tools/toml-formatter) | Data | Validate and reformat TOML. |
| [XML ↔ CSV Converter](https://arahman200165.github.io/DUDE/tools/xml-csv) | Data | Convert flat XML records to CSV rows and back. |
| [XML Formatter](https://arahman200165.github.io/DUDE/tools/xml-formatter) | Data | Validate, format, and minify XML. |
| [XML XPath Tester](https://arahman200165.github.io/DUDE/tools/xml-xpath) | Data | Test an XPath expression against XML using the browser's native XPath engine. |
| [XML Schema / XSD Validator](https://arahman200165.github.io/DUDE/tools/xml-xsd-validator) | Data | Validate XML against an XSD schema, via libxml2 compiled to WebAssembly — no network calls once the runtime is cached. |
| [YAML Anchor / Alias Visualizer](https://arahman200165.github.io/DUDE/tools/yaml-anchors) | Data | Visualize a YAML document's anchors and aliases and where each one resolves. |
| [YAML ↔ JSON Converter](https://arahman200165.github.io/DUDE/tools/yaml-json) | Data | Convert between YAML and JSON, in either direction. |
| [YAML Linter](https://arahman200165.github.io/DUDE/tools/yaml-linter) | Data | Validate YAML and surface parse errors with line and column detail. |
| [YAML Merge](https://arahman200165.github.io/DUDE/tools/yaml-merge) | Data | Deep-merge two YAML documents into one. |
| [YAML Path Tester](https://arahman200165.github.io/DUDE/tools/yaml-path) | Data | Query a YAML document with a JSONPath or JMESPath expression. |
| [Advanced Diff / Merge](https://arahman200165.github.io/DUDE/tools/advanced-diff) | Text | Line, word, character, semantic JSON/YAML/XML, or image diffing with a side-by-side two-way or three-way merge view, file upload, and unified-diff export. |
| [ASCII Art Generator / Banner](https://arahman200165.github.io/DUDE/tools/ascii-art-generator) | Text | Renders text as an ASCII-art banner, with a choice of FIGlet fonts. |
| [ASCII Table](https://arahman200165.github.io/DUDE/tools/ascii-table) | Text | Searchable reference of the 128 standard ASCII characters, with decimal, hex, octal, and control-code names. |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Text | Inventory and convert a folder of text files: line endings (LF/CRLF), encoding (UTF-8/16, Windows-125x, Shift_JIS…), BOM, final newline, trailing whitespace and indentation — or apply .editorconfig. |
| [Case Converter](https://arahman200165.github.io/DUDE/tools/case-converter) | Text | Convert text between camelCase, snake_case, kebab-case, Title Case, and more. |
| [Text Diff](https://arahman200165.github.io/DUDE/tools/diff) | Text | Line-oriented diff between two blocks of text. |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | Text | Compare two folders for added/removed/changed files, with a line diff for text files and a hex byte diff for binary files. |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Text | Generate a tree listing of any folder on disk — Unicode/ASCII `tree`, Markdown, JSON, collapsible HTML, Mermaid or PlantUML — honoring .gitignore, depth and filters. |
| [Duplicate Finder](https://arahman200165.github.io/DUDE/tools/duplicate-finder) | Text | Finds duplicate lines or duplicate words in text, with counts and one-click removal. |
| [Extract Columns](https://arahman200165.github.io/DUDE/tools/extract-columns) | Text | Splits each line on a delimiter and extracts/reorders the selected columns. |
| [Find & Replace](https://arahman200165.github.io/DUDE/tools/find-replace-text) | Text | Literal (non-regex) find and replace, with case-sensitive and whole-word options. |
| [Invisible / Control / Zero-Width Character Scanner](https://arahman200165.github.io/DUDE/tools/invisible-char-scanner) | Text | Scans text for invisible, control, and zero-width characters, lists each occurrence, and strips selected kinds. |
| [Keyword Frequency Analyzer](https://arahman200165.github.io/DUDE/tools/keyword-frequency-analyzer) | Text | Counts word frequency in text, with stop-word filtering and a minimum-length filter. |
| [Line Order Tools](https://arahman200165.github.io/DUDE/tools/line-order-tools) | Text | Sort (ascending, descending, natural, or by length), shuffle, or reverse the lines of a text block. |
| [Line Prefix/Suffix & Numbering](https://arahman200165.github.io/DUDE/tools/line-prefix-numbering) | Text | Add a prefix/suffix, add or remove line numbers, or apply a transform to every line at once. |
| [Lorem Ipsum & Placeholder Text Generator](https://arahman200165.github.io/DUDE/tools/lorem-ipsum-generator) | Text | Generates classic Lorem Ipsum or faker-based placeholder text, as words, sentences, or paragraphs. |
| [Slug Generator](https://arahman200165.github.io/DUDE/tools/slug-generator) | Text | Turn a title into a URL-friendly slug, with transliteration and length control. |
| [Smart Quotes Normalizer](https://arahman200165.github.io/DUDE/tools/smart-quotes-normalizer) | Text | Convert curly quotes, dashes, and ellipses to straight ASCII equivalents, or the reverse. |
| [Soundex / Metaphone](https://arahman200165.github.io/DUDE/tools/soundex-metaphone) | Text | Computes the Soundex and Metaphone phonetic codes for one or more words. |
| [String Similarity Calculator](https://arahman200165.github.io/DUDE/tools/string-similarity-calculator) | Text | Compares two strings with Levenshtein distance/similarity and Jaro-Winkler similarity. |
| [Text Inspector](https://arahman200165.github.io/DUDE/tools/text-inspector) | Text | Character, word, line, and byte metrics for any text, plus readability scoring, language detection, and grammar checking. |
| [Text Tokenizer & N-Gram Generator](https://arahman200165.github.io/DUDE/tools/text-tokenizer-ngram) | Text | Tokenizes text into words or sentences, or generates word- or character-level n-grams with counts. |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Text | Search every file under a folder: ripgrep-style text/regex with context, files by name/size/date/type, and JSONPath, JMESPath, YAML and XPath queries — with previewed replace across files. |
| [Unicode Character Inspector](https://arahman200165.github.io/DUDE/tools/unicode-character-inspector) | Text | Inspect pasted text character by character: code point, UTF-8/UTF-16 bytes, general category, Unicode block, and official name. |
| [Unicode Code Point Converter](https://arahman200165.github.io/DUDE/tools/unicode-code-point-converter) | Text | Convert between U+XXXX notation, decimal, HTML entities, JS \u escapes, and UTF-8 hex bytes, single or bulk. |
| [Unicode Normalization](https://arahman200165.github.io/DUDE/tools/unicode-normalization) | Text | Normalize text to NFC, NFD, NFKC, or NFKD, with a before/after code point comparison. |
| [Unicode Table](https://arahman200165.github.io/DUDE/tools/unicode-table) | Text | Browse Unicode characters by block, or search by code point, character, or name. |
| [Whitespace Cleaner / Normalizer](https://arahman200165.github.io/DUDE/tools/whitespace-cleaner) | Text | Trim, collapse, and normalize whitespace, line endings, tabs/spaces, and indentation. |
| [Archive Creator / Extractor](https://arahman200165.github.io/DUDE/tools/archive-tool) | Encoding | Creates or extracts ZIP, TAR, and TAR.GZ archives entirely client-side. |
| [Barcode Generator](https://arahman200165.github.io/DUDE/tools/barcode-generator) | Encoding | Generates a CODE128, EAN-13/8, UPC, CODE39, ITF-14, or codabar barcode, with check-digit validation. |
| [Barcode Reader](https://arahman200165.github.io/DUDE/tools/barcode-reader) | Encoding | Decodes a barcode from an uploaded image or a live webcam feed, entirely client-side. |
| [Base-N Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/base-n-encoder) | Encoding | Encode or decode text as Binary, Base16, Base32, Base36, Base58, Base62, Base85/ASCII85, or basE91. |
| [Base64 Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/base64) | Encoding | UTF-8-safe text-to-Base64 and Base64-to-text conversion. |
| [Base64 Image Viewer](https://arahman200165.github.io/DUDE/tools/base64-image-viewer) | Encoding | Previews a Base64 string or data URI as an image, or encodes an uploaded image to Base64. |
| [Color Blindness Simulator](https://arahman200165.github.io/DUDE/tools/color-blindness-simulator) | Encoding | Simulates protanopia, deuteranopia, and tritanopia on an uploaded image via a per-pixel canvas transform. |
| [Color Converter](https://arahman200165.github.io/DUDE/tools/color-converter) | Encoding | Convert between HEX, RGB, HSL, HSV, CMYK, and named CSS colors. |
| [Compression Lab](https://arahman200165.github.io/DUDE/tools/compression-lab) | Encoding | Compresses or decompresses text or a file with gzip or deflate (native Compression Streams API), comparing before/after size and ratio. |
| [Contrast Checker / WCAG Compliance Checker](https://arahman200165.github.io/DUDE/tools/contrast-checker) | Encoding | Computes the WCAG contrast ratio between two colors and flags AA/AAA pass/fail for text and UI components. |
| [Data URI Converter](https://arahman200165.github.io/DUDE/tools/data-uri-converter) | Encoding | Generates a data: URI from a file or text, or decodes one back to a previewable, downloadable file. |
| [Escape / Unescape Toolkit](https://arahman200165.github.io/DUDE/tools/escape-unescape-toolkit) | Encoding | Escapes or unescapes text for JavaScript, CSS, SQL, POSIX shell, PowerShell, or quoted-printable. |
| [File Base64 Converter](https://arahman200165.github.io/DUDE/tools/file-base64) | Encoding | Convert a local file to Base64 text, or a Base64 string back into a downloadable file, with MIME sniffing and an image preview. |
| [Gradient Generator](https://arahman200165.github.io/DUDE/tools/gradient-generator) | Encoding | Builds a CSS linear, radial, or conic gradient from editable color stops, with a live preview. |
| [Hex Dump Viewer / Builder](https://arahman200165.github.io/DUDE/tools/hex-dump) | Encoding | Renders a file as a classic offset/hex/ASCII hex dump, or rebuilds a file from a pasted hex dump. |
| [Hex ↔ Text Converter](https://arahman200165.github.io/DUDE/tools/hex-text-converter) | Encoding | Convert between raw hex bytes and ASCII, UTF-8, or UTF-16 (LE/BE) text. |
| [HTML Entity Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/html-entities) | Encoding | Encode text as HTML entities, or decode named and numeric entities back to text. |
| [Number Base Converter](https://arahman200165.github.io/DUDE/tools/number-base) | Encoding | Convert whole numbers between binary, octal, decimal, hex, or any base 2–36. |
| [Palette Generator](https://arahman200165.github.io/DUDE/tools/palette-generator) | Encoding | Generates complementary, analogous, triadic, tetradic, and monochromatic color palettes from a base color. |
| [QR Code Generator](https://arahman200165.github.io/DUDE/tools/qr-code-generator) | Encoding | Generates a QR code for a URL/text, Wi-Fi network, contact card, or TOTP secret. |
| [QR Code Scanner](https://arahman200165.github.io/DUDE/tools/qr-code-scanner) | Encoding | Decodes a QR code from an uploaded image or a live webcam feed, entirely client-side. |
| [ROT13 / ROT47 Cipher](https://arahman200165.github.io/DUDE/tools/rot-cipher) | Encoding | Applies the self-inverse ROT13 or ROT47 letter/character rotation cipher. |
| [SVG ↔ Data URI](https://arahman200165.github.io/DUDE/tools/svg-data-uri) | Encoding | Converts SVG markup to a data:image/svg+xml URI (URL-encoded or base64) and back. |
| [Tailwind Color Matcher](https://arahman200165.github.io/DUDE/tools/tailwind-color-matcher) | Encoding | Finds the nearest Tailwind CSS v4 default-palette colors to an arbitrary color, ranked by OKLab perceptual distance. |
| [URL Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/url-encode) | Encoding | Percent-encode or decode text as a URL component or a full URI. |
| [ACL Inspector](https://arahman200165.github.io/DUDE/tools/acl-inspector) | Security | Inspect Windows file, folder and registry security descriptors: owner, DACL and SACL entries, decoded rights, inheritance and SDDL; add or remove a permission entry or change inheritance through a reviewed, undoable system plan. |
| [AES Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/aes-encrypt-decrypt) | Security | Encrypts or decrypts text with AES-GCM or AES-CBC, using a passphrase-derived (PBKDF2) key. |
| [Asymmetric Key Generator](https://arahman200165.github.io/DUDE/tools/asymmetric-key-generator) | Security | Generates an RSA, EC, or Ed25519 key pair in-browser, exported as PEM or JWK. |
| [Basic Auth Header Generator](https://arahman200165.github.io/DUDE/tools/basic-auth-generator) | Security | Builds (or decodes) an HTTP Basic Authorization header from a username and password. |
| [Bearer Token Builder](https://arahman200165.github.io/DUDE/tools/bearer-token-builder) | Security | Wraps a token into a properly formatted Bearer Authorization header, with format validation. |
| [Certificate Chain Viewer & Builder](https://arahman200165.github.io/DUDE/tools/certificate-chain-tools) | Security | Splits, reorders, verifies, and re-assembles a multi-certificate PEM chain bundle. |
| [Certificate Watch List](https://arahman200165.github.io/DUDE/tools/certificate-watch-list) | Security | Watch TLS endpoints for expiry and unexpected certificate changes. Opt-in background checks run while DUDE is open, with configurable thresholds and native notifications. |
| [ChaCha20-Poly1305 Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/chacha20-poly1305) | Security | Encrypts or decrypts text with ChaCha20-Poly1305 or XChaCha20-Poly1305, using a passphrase-derived (PBKDF2) key. |
| [CSR Generator & Inspector](https://arahman200165.github.io/DUDE/tools/csr-generator-inspector) | Security | Generates an RSA CSR (PKCS#10) signed with a pasted private key, or inspects an existing CSR. |
| [Certificate Transparency Lookup](https://arahman200165.github.io/DUDE/tools/ct-lookup) | Security | Decode a certificate's embedded SCTs and name each CT log from a bundled list, and search a domain's certificate history on crt.sh. |
| [File Hash Generator](https://arahman200165.github.io/DUDE/tools/file-hash) | Security | MD5, SHA-1, SHA-256, SHA-384, and SHA-512 digests for a local file. |
| [Hash Generator](https://arahman200165.github.io/DUDE/tools/hash) | Security | MD5, SHA-1, SHA-256, SHA-384, and SHA-512 digests for text. |
| [Hash Manifest & Snapshot](https://arahman200165.github.io/DUDE/tools/hash-manifest) | Security | Bulk-hash a folder into sha256sum / BSD-tag / JSON / CSV manifests with a Merkle directory hash, verify manifests, and snapshot folders to diff later or against a live rescan. |
| [HMAC Generator](https://arahman200165.github.io/DUDE/tools/hmac-generator) | Security | HMAC-SHA1, HMAC-SHA256, HMAC-SHA384, and HMAC-SHA512 message authentication codes with a custom key. |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | Security | One composite HTTPS check: TLS versions and ciphers, chain and hostname, expiry, OCSP stapling, HTTP→HTTPS redirect, HSTS, CAA, and HTTPS/SVCB — as pass/warn/fail findings, with no letter grade. |
| [JWKS → Public Keys](https://arahman200165.github.io/DUDE/tools/jwks-to-pem) | Security | Converts JWKS keys to PEM (SPKI) or raw JWK for use outside the browser. |
| [JWKS Viewer](https://arahman200165.github.io/DUDE/tools/jwks-viewer) | Security | Inspects a JWKS document — enumerates keys, decodes each JWK's parameters, and flags common problems. |
| [JWT Debugger](https://arahman200165.github.io/DUDE/tools/jwt) | Security | Decode a JWT header and payload — does not verify signatures. |
| [JWT Claims Analyzer](https://arahman200165.github.io/DUDE/tools/jwt-claims-analyzer) | Security | Decodes a JWT and flags claim-level issues — missing/expired timestamps, risky algorithms, non-standard claims. |
| [JWT Expiration Visualizer](https://arahman200165.github.io/DUDE/tools/jwt-expiration-visualizer) | Security | Visualizes a JWT's iat/nbf/exp window on a timeline relative to now. |
| [JWT Signer](https://arahman200165.github.io/DUDE/tools/jwt-signer) | Security | Sign a JWT with an HMAC secret or an RSA/EC/RSA-PSS private key, with in-browser key-pair generation. |
| [JWT Signature Verifier](https://arahman200165.github.io/DUDE/tools/jwt-verify) | Security | Verify a JWT signature locally against a shared secret or public key, or a fetched JWKS — with named presets for Auth0, Okta, Azure AD, and Google. |
| [Live Certificate Chain Fetcher](https://arahman200165.github.io/DUDE/tools/live-certificate-chain) | Security | Fetch the full certificate chain a host:port presents, validate it against the Mozilla and Windows trust stores, and analyze hostname mismatches (wildcards, IP SANs, near misses). |
| [OAuth 2.0 Playground](https://arahman200165.github.io/DUDE/tools/oauth-playground) | Security | Builds and inspects OAuth 2.0 / OIDC requests and responses for every grant type, without a live redirect flow. |
| [OAuth Scope Parser](https://arahman200165.github.io/DUDE/tools/oauth-scope-parser) | Security | Splits an OAuth/OIDC space-delimited scope string into individual scopes with known-scope annotations. |
| [OAuth Token Inspector](https://arahman200165.github.io/DUDE/tools/oauth-token-inspector) | Security | Inspects an OAuth access/refresh/ID token — auto-detects JWT vs opaque, decodes claims and scope, flags expiry. |
| [OpenID Connect Discovery Document Inspector](https://arahman200165.github.io/DUDE/tools/oidc-discovery-inspector) | Security | Inspects a pasted OIDC discovery document (.well-known/openid-configuration) — validates required fields and summarizes capabilities. |
| [Password / Passphrase Generator](https://arahman200165.github.io/DUDE/tools/password-generator) | Security | Generates a random-character password or a diceware-style passphrase using a CSPRNG. |
| [Password Strength & Entropy Analyzer](https://arahman200165.github.io/DUDE/tools/password-strength-analyzer) | Security | Scores a password's entropy and strength, with crack-time estimates and common-pattern warnings. |
| [PEM / DER Inspector & Converter](https://arahman200165.github.io/DUDE/tools/pem-der-inspector) | Security | Inspects a PEM block or raw DER bytes as a human-readable ASN.1 tree, and converts between the two. |
| [PKCE Generator](https://arahman200165.github.io/DUDE/tools/pkce-generator) | Security | Generates an RFC 7636 PKCE code_verifier and its S256 (or plain) code_challenge. |
| [PKCE Verifier](https://arahman200165.github.io/DUDE/tools/pkce-verifier) | Security | Checks whether a code_verifier matches a given code_challenge (round-trip validation). |
| [PKCS#12 / PFX Inspector](https://arahman200165.github.io/DUDE/tools/pkcs12-inspector) | Security | Inspects a .p12/.pfx file's certificates and private keys given its password. |
| [Certificate Revocation Inspector](https://arahman200165.github.io/DUDE/tools/revocation-inspector) | Security | Check a certificate against its own OCSP responder and CRL, and fetch a missing issuer via AIA. Contacts only the URLs named in the certificate, over HTTP, and verifies the responses. |
| [SID & Account Resolver](https://arahman200165.github.io/DUDE/tools/sid-account-resolver) | Security | Decode Windows SIDs, resolve account names, and inspect the current token, local accounts, groups and profile list. |
| [SSH Key Generator & Inspector](https://arahman200165.github.io/DUDE/tools/ssh-key-tools) | Security | Generates an RSA, ECDSA, or Ed25519 SSH key pair, or inspects an SSH public key and its fingerprint. |
| [STARTTLS Inspector](https://arahman200165.github.io/DUDE/tools/starttls-inspector) | Security | Negotiate a STARTTLS upgrade for SMTP, IMAP, POP3, FTP, LDAP, PostgreSQL, MySQL, or XMPP, show the plaintext transcript, then inspect the TLS layer and certificate chain. |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Security | Inspect a live TLS handshake: negotiated version, cipher, ALPN, SNI behavior, the presented chain with dual-store trust and hostname verdicts, a handshake timeline, HTTP/3, mTLS, and configuration weaknesses. |
| [X.509 Certificate Inspector](https://arahman200165.github.io/DUDE/tools/x509-certificate-inspector) | Security | Inspects a certificate's subject/issuer, validity, SAN, extensions, and fingerprints. |
| [Cron Expression Parser](https://arahman200165.github.io/DUDE/tools/cron) | Date & Time | Parse a cron expression into a richer human-readable schedule and preview its next or previous run times. |
| [Date Calculator](https://arahman200165.github.io/DUDE/tools/date-calculator) | Date & Time | Add/subtract calendar or business days from a date, and count days/weekdays/business-days between two dates. |
| [DST Transition Explorer](https://arahman200165.github.io/DUDE/tools/dst-transition-explorer) | Date & Time | List every daylight-saving-time transition for a timezone in a chosen year, with the exact offset change and gap. |
| [Duration Parser / Formatter](https://arahman200165.github.io/DUDE/tools/duration-formatter) | Date & Time | Parse a human or ISO 8601 duration and see it in every representation at once. |
| [Epoch Timeline Visualizer](https://arahman200165.github.io/DUDE/tools/epoch-timeline-visualizer) | Date & Time | Plots a list of labeled timestamps, or a start/end range, proportionally along a horizontal timeline relative to each other and to now. |
| [Recurrence Rule Calculator](https://arahman200165.github.io/DUDE/tools/recurrence-rule) | Date & Time | Expand an iCal-style RRULE recurrence into a list of occurrence dates — event recurrence, distinct from cron trigger schedules. |
| [Relative Time Parser](https://arahman200165.github.io/DUDE/tools/relative-time-parser) | Date & Time | Parses free text like "3 days ago" or "next tuesday" into a timestamp, and formats a timestamp back into relative text. |
| [Stopwatch & Countdown](https://arahman200165.github.io/DUDE/tools/stopwatch-countdown) | Date & Time | A start/pause/reset stopwatch, and a countdown timer that ticks down from a set duration. |
| [Date / Timezone Converter](https://arahman200165.github.io/DUDE/tools/timezone-converter) | Date & Time | Convert a moment in time across a chosen set of IANA timezones. |
| [Timezone Offset Comparator](https://arahman200165.github.io/DUDE/tools/timezone-offset-comparator) | Date & Time | Compares UTC offsets across a full year, or pairwise, and shows when an asymmetric DST schedule changes the gap between two zones. |
| [Unix Timestamp Converter](https://arahman200165.github.io/DUDE/tools/unix-timestamp) | Date & Time | Convert between Unix timestamps (seconds through nanoseconds), ISO 8601, HTTP-date, RFC 2822, and human-readable dates. |
| [Week Number Calculator](https://arahman200165.github.io/DUDE/tools/week-number-calculator) | Date & Time | Convert a date to its ISO-8601 week number and back, and see how many weeks a given week-year has. |
| [Accept Header Builder](https://arahman200165.github.io/DUDE/tools/accept-header-builder) | Web | Builds or parses an Accept header, weighting media types with q values and showing the resulting preference order. |
| [AWS Signature V4 Inspector](https://arahman200165.github.io/DUDE/tools/aws-sigv4-inspector) | Web | Recomputes and verifies an AWS Signature Version 4 signed request, or builds one from scratch. |
| [Cache-Control Builder](https://arahman200165.github.io/DUDE/tools/cache-control-builder) | Web | Builds or parses a Cache-Control header from its directives, for either a request or a response, flagging contradictory combinations. |
| [Content-Disposition Builder](https://arahman200165.github.io/DUDE/tools/content-disposition-builder) | Web | Builds a Content-Disposition header with an RFC 5987 filename* parameter for non-ASCII filenames, alongside the ASCII fallback. |
| [Cookie Tools](https://arahman200165.github.io/DUDE/tools/cookie-tools) | Web | Parses a request Cookie header into name/value pairs, or builds a response Set-Cookie header with its attributes, flagging common mistakes. |
| [CORS Header Builder](https://arahman200165.github.io/DUDE/tools/cors-header-builder) | Web | Builds the CORS response headers and checks whether a hypothetical request would pass preflight — construct-and-display, never a real request. |
| [CSP Builder](https://arahman200165.github.io/DUDE/tools/csp-builder) | Web | Builds or parses a Content-Security-Policy header directive by directive, flagging weakening combinations like unsafe-inline or a wildcard source. |
| [cURL Command Inspector / Converter](https://arahman200165.github.io/DUDE/tools/curl-converter) | Web | Parse a cURL command into its parts, build one interactively, and export it as code in 15 languages. |
| [HTTP Digest Auth Helper](https://arahman200165.github.io/DUDE/tools/http-digest-auth-helper) | Web | Computes an RFC 7616/2617 HTTP Digest Authorization header from a WWW-Authenticate challenge and credentials. |
| [HTTP Header Inspector / Builder](https://arahman200165.github.io/DUDE/tools/http-header-inspector) | Web | Inspect pasted HTTP headers as key/value pairs, or build a header set from scratch. |
| [HTTP Request Builder / Converter](https://arahman200165.github.io/DUDE/tools/http-request-builder) | Web | Build an HTTP request from fields or paste a raw HTTP/1.1 request, then export it as cURL, raw HTTP, or any of the cURL converter language targets. |
| [HTTP Response Viewer](https://arahman200165.github.io/DUDE/tools/http-response-viewer) | Web | Paste a raw HTTP response to view its status, headers, and body, with automatic JSON pretty-printing. |
| [HTTP Status Code Reference](https://arahman200165.github.io/DUDE/tools/http-status) | Web | Searchable reference of every IANA-registered HTTP status code. |
| [MIME Type Reference](https://arahman200165.github.io/DUDE/tools/mime-types) | Web | Searchable reference of common IANA-registered MIME types with file-extension lookups. |
| [Multipart Form Data Builder](https://arahman200165.github.io/DUDE/tools/multipart-form-builder) | Web | Builds a multipart/form-data request body preview from text fields and attached files, with the matching Content-Type boundary header. |
| [Punycode Converter](https://arahman200165.github.io/DUDE/tools/punycode-converter) | Web | Converts an internationalized domain name between Unicode and its Punycode (ASCII, "xn--") form, and inspects it for mixed-script homograph risk. |
| [Query String Parser / Builder](https://arahman200165.github.io/DUDE/tools/query-string) | Web | Parse a query string or URL into key/value pairs, or build one from scratch — also ready to copy as an application/x-www-form-urlencoded request body. |
| [Range Header Builder](https://arahman200165.github.io/DUDE/tools/range-header-builder) | Web | Builds or parses a request Range header (single or multi-range, including open-ended and suffix ranges) and a response Content-Range header. |
| [URL / URI Inspector](https://arahman200165.github.io/DUDE/tools/url-inspector) | Web | Break a URL down into scheme, host, path, query, and fragment — edit any part, and see a colorized component breakdown. |
| [URL Normalizer & Comparator](https://arahman200165.github.io/DUDE/tools/url-normalizer) | Web | Canonicalizes a URL to its normalized form, resolves a relative reference against a base, or compares two URLs for equivalence. |
| [URL Percent-Encoding Inspector](https://arahman200165.github.io/DUDE/tools/url-percent-inspector) | Web | Breaks a URL or component down byte-by-byte, grouping percent-encoded UTF-8 sequences and flagging unencoded reserved characters. |
| [URL Safety Inspector](https://arahman200165.github.io/DUDE/tools/url-safety-inspector) | Web | Heuristic URL safety checks — punycode homograph risk, userinfo tricks, IP-literal hosts, suspicious TLDs, and deep subdomain chains. |
| [User-Agent Parser](https://arahman200165.github.io/DUDE/tools/user-agent) | Web | Break a User-Agent string down into browser, engine, OS, and device details. |
| [Batch Operations](https://arahman200165.github.io/DUDE/tools/batch-operations) | Developer | Journal of every change DUDE applied to files on disk: per-file outcomes, previewed undo, backup storage, retention, and remembered folders. |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Developer | Rename files and folders on disk by find/replace, regex, tokens (counter, date, parent, hash), case transform, or an old→new list — live preview, Windows-name checks, and undo. |
| [Arbitrary Precision Calculator](https://arahman200165.github.io/DUDE/tools/bigint-calculator) | Developer | Exact-precision integer arithmetic (add/subtract/multiply/divide/mod/power/factorial) with no 64-bit limit. |
| [Binary Strings Extractor](https://arahman200165.github.io/DUDE/tools/binary-strings-extractor) | Developer | Extracts printable ASCII and little-endian UTF-16 text runs from an uploaded file, like the Unix `strings` utility, with an adjustable minimum length. |
| [Binary Structure Inspector](https://arahman200165.github.io/DUDE/tools/binary-structure-inspector) | Developer | Parses an uploaded file against a user-defined sequence of typed fields (integers, floats, fixed-length strings, chosen endianness) into a table of offsets and decoded values. |
| [BOM Detector / Remover](https://arahman200165.github.io/DUDE/tools/bom-detector) | Developer | Detects a UTF-8/16/32 byte-order mark at the start of an uploaded file and offers a one-click download of the file with it stripped. |
| [Border Radius Generator](https://arahman200165.github.io/DUDE/tools/border-radius-generator) | Developer | Builds a CSS border-radius declaration from linked or independent corner values, with a live preview. |
| [Box Shadow Generator](https://arahman200165.github.io/DUDE/tools/box-shadow-generator) | Developer | Builds a single or multi-layer CSS box-shadow declaration with a live preview. |
| [Branch Name Generator](https://arahman200165.github.io/DUDE/tools/branch-name-generator) | Developer | Builds a slugified branch name from a type, optional ticket id, and description. |
| [Byte Frequency Analyzer](https://arahman200165.github.io/DUDE/tools/byte-frequency-analyzer) | Developer | Charts how often each of the 256 byte values occurs in an uploaded file, and reports the most frequent byte and how many distinct values appear. |
| [chmod / Unix Permissions Converter](https://arahman200165.github.io/DUDE/tools/chmod-converter) | Developer | Converts between symbolic (rwxr-xr--) and octal (754) Unix permissions, with a visual owner/group/other checkbox grid and setuid/setgid/sticky bits. |
| [CIDR Calculator](https://arahman200165.github.io/DUDE/tools/cidr-calculator) | Developer | Computes the network/broadcast address, usable host range, and host count for an IPv4 CIDR block. |
| [Commit Message Validator](https://arahman200165.github.io/DUDE/tools/commit-message-validator) | Developer | Validates a commit message against the Conventional Commits spec, flagging format, length, and style issues. |
| [Config File Comparator](https://arahman200165.github.io/DUDE/tools/config-file-comparator) | Developer | Diffs two config files as .env, INI, or Java .properties, reporting added, removed, and changed keys. |
| [Configuration Merge Tool](https://arahman200165.github.io/DUDE/tools/config-merge-tool) | Developer | Merges an ordered list of .env/INI/.properties/YAML/JSON config sources, later sources overriding earlier ones. |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | Developer | Test an HTTP endpoint with configurable method, headers, and body. |
| [Conventional Commit Builder](https://arahman200165.github.io/DUDE/tools/conventional-commit-builder) | Developer | Builds a Conventional Commits formatted message from a type, scope, subject, body, and footers. |
| [CSS Animation Builder](https://arahman200165.github.io/DUDE/tools/css-animation-builder) | Developer | Builds an @keyframes block and its animation shorthand from an ordered list of percentage stops, with a live preview. |
| [CSS Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/css-formatter) | Developer | Pretty-prints or minifies CSS, comment- and string-aware, including nested at-rules like @media. |
| [CSS Grid Playground](https://arahman200165.github.io/DUDE/tools/css-grid-playground) | Developer | Interactively builds grid container and item-placement CSS with a live preview of editable, addable items. |
| [CSS Selector Tester](https://arahman200165.github.io/DUDE/tools/css-selector-tester) | Developer | Tests a CSS selector against sample HTML and lists every matched element in document order. |
| [CSS Specificity Calculator / Comparer](https://arahman200165.github.io/DUDE/tools/css-specificity-calculator) | Developer | Scores one or more CSS selectors by specificity and ranks them from most to least specific. |
| [CSS Transform Builder](https://arahman200165.github.io/DUDE/tools/css-transform-builder) | Developer | Builds a CSS transform declaration from translate, rotate, scale, and skew controls, with a live preview. |
| [Cubic-Bezier Editor](https://arahman200165.github.io/DUDE/tools/cubic-bezier-editor) | Developer | Interactive cubic-bezier() easing curve editor with draggable control points and a live animated preview. |
| [CUID Generator](https://arahman200165.github.io/DUDE/tools/cuid-generator) | Developer | Generates collision-resistant CUID2 identifiers with a configurable count and length. |
| [Dependency Version Comparator](https://arahman200165.github.io/DUDE/tools/dependency-version-comparator) | Developer | Diffs two pasted dependency lists (package.json-style), classifying each change as added, removed, or a major/minor/patch upgrade or downgrade. |
| [Dependency Walker](https://arahman200165.github.io/DUDE/tools/dependency-walker) | Developer | Recursively resolves Windows PE imports and delay-loads, checking architecture, imported symbols, forwarders, and unresolved modules. |
| [Dev Snippets Reference](https://arahman200165.github.io/DUDE/tools/dev-snippets-reference) | Developer | Searchable reference of common HTTP headers, regex syntax, git/docker commands, shell idioms, SQL, CSS, HTML, Unicode, MIME types, cron syntax, and chmod. |
| [DNS Lookup](https://arahman200165.github.io/DUDE/tools/dns-lookup) | Developer | Query live DNS records (incl. CAA, DNSSEC, TLSA, HTTPS/SVCB) over system, custom, DoH, or DoT resolvers, with flags and transport diagnostics. |
| [DNS Propagation Tester](https://arahman200165.github.io/DUDE/tools/dns-propagation) | Developer | Compare one DNS record across public presets, the system resolver, and up to five custom classic, DoH, or DoT resolvers. |
| [DNSSEC Inspector](https://arahman200165.github.io/DUDE/tools/dnssec-inspector) | Developer | Validate a DNS answer locally from the IANA root trust anchors: DS/DNSKEY/RRSIG chain, NSEC/NSEC3 denial proofs, and algorithm warnings. |
| [Docker Compose Validator / Viewer](https://arahman200165.github.io/DUDE/tools/docker-compose-validator) | Developer | Validates a docker-compose YAML file against a minimal Compose Specification shape and browses it as a tree. |
| [Docker Run ↔ Compose Converter](https://arahman200165.github.io/DUDE/tools/docker-run-compose-converter) | Developer | Converts a docker run command into a docker-compose service block, or the reverse. |
| [Dockerfile Linter / Formatter](https://arahman200165.github.io/DUDE/tools/dockerfile-linter) | Developer | Lints a Dockerfile for common issues (unpinned base image, root user, apt-get cleanup, ADD vs COPY, bad EXPOSE ports) and normalizes instruction casing. |
| [DOM Tree Viewer](https://arahman200165.github.io/DUDE/tools/dom-tree-viewer) | Developer | Parses HTML and renders it as a collapsible DOM tree — elements, attributes, text nodes, and comments. |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Developer | Find identical files across a folder or drive (size, fingerprint, SHA-256, optional byte-compare) and text files with the same content, then recycle extras by keep-rule with a previewed plan. |
| [ELF Header Viewer](https://arahman200165.github.io/DUDE/tools/elf-header-viewer) | Developer | Parses a Linux/Unix ELF binary's header, program headers, section headers, and dynamic symbol table (32-bit/64-bit, either endianness) into a browsable tree. |
| [Email Auth Inspector](https://arahman200165.github.io/DUDE/tools/email-auth-inspector) | Developer | Inspect SPF (include tree, 10-lookup limit, sender IP evaluation), DKIM keys (typed, from pasted headers, or common selectors), and DMARC policy with report authorization. |
| [Encoding Detector](https://arahman200165.github.io/DUDE/tools/encoding-detector) | Developer | Guesses an uploaded file's text encoding from its byte-order mark, or from a UTF-8/ASCII validity check when there is none, with a confidence rating. |
| [.env Diff](https://arahman200165.github.io/DUDE/tools/env-diff) | Developer | Diffs two .env files, reporting added, removed, and changed variables. |
| [.env Editor](https://arahman200165.github.io/DUDE/tools/env-editor) | Developer | Edits a .env file as a key/value list or raw text, with quoting handled automatically. |
| [.env ↔ JSON](https://arahman200165.github.io/DUDE/tools/env-json-converter) | Developer | Converts a .env file to a flat JSON object, or the reverse. |
| [.env Validator](https://arahman200165.github.io/DUDE/tools/env-validator) | Developer | Validates a .env file against a required-keys list with lightweight number/boolean/url type hints. |
| [Environment Variables](https://arahman200165.github.io/DUDE/tools/environment-variables) | Developer | View the user, machine and volatile Windows environment variables raw and expanded, add, edit or delete them through a previewed, confirmed change, and diff two environments (live, saved snapshot or pasted dump) with a PATH-aware breakdown. |
| [Error Code Reference](https://arahman200165.github.io/DUDE/tools/error-code-reference) | Developer | Searchable reference of Windows/Win32/HRESULT, POSIX errno, Linux signals, SQL, TLS alert, and DNS response codes. |
| [Event Log Viewer](https://arahman200165.github.io/DUDE/tools/event-log-viewer) | Developer | Read any Windows event log channel or an opened .evtx file: build a filter (level, provider, event ID, time, text) that generates the XPath, or edit the XPath directly; save queries, import and export Event Viewer custom views, correlate by ActivityID, and follow new events with incremental polling. |
| [Expression Evaluator](https://arahman200165.github.io/DUDE/tools/expression-evaluator) | Developer | Evaluates a math expression with named variables, functions, units, and matrices via a sandboxed expression parser. |
| [File Entropy Analyzer](https://arahman200165.github.io/DUDE/tools/file-entropy-analyzer) | Developer | Computes an uploaded file's Shannon byte-distribution entropy overall and in sliding windows, to spot packed, encrypted, or compressed regions. |
| [File Inspector](https://arahman200165.github.io/DUDE/tools/file-inspector) | Developer | A "file forensics" summary: detected signature/container format, Shannon entropy verdict, and a sample of extracted strings, all in one dashboard. |
| [File Lock Inspector](https://arahman200165.github.io/DUDE/tools/file-lock-inspector) | Developer | Find out what is using a file or folder: lists the applications and services holding it (Windows Restart Manager, no admin needed), scans exact handles when elevated, and releases the lock through a previewed, confirmed change: a graceful Restart Manager shutdown or restart first, ending the owner process as the fallback. Handles are never force-closed. |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Developer | Split a file by size, part count or whole lines (repeat a CSV header) with .001 / split-style / -001.ext naming and a SHA-256 checksum file; detect part sets and join them back with verification. |
| [File Signature & Type Detector](https://arahman200165.github.io/DUDE/tools/file-type-detector) | Developer | Identifies an uploaded file's real format from its magic bytes, disambiguates ZIP-based containers like docx/xlsx/pptx/jar, and flags a mismatch against the declared file extension. |
| [Flexbox Playground](https://arahman200165.github.io/DUDE/tools/flexbox-playground) | Developer | Interactively builds flex container and item CSS with a live preview of editable, addable items. |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Developer | Recursive, drive-capable disk usage: a sortable size tree, treemap, largest files, and breakdowns by extension and age, with previewed Recycle Bin clean-up. |
| [Git Command Builder](https://arahman200165.github.io/DUDE/tools/git-command-builder) | Developer | Builds a git command from a subcommand and its common flags — clone, commit, branch, merge, rebase, reset, tag, push, pull, log, and stash. |
| [Git Command Explainer](https://arahman200165.github.io/DUDE/tools/git-command-explainer) | Developer | Breaks an arbitrary git command down token by token, explaining each subcommand, flag, and positional argument. |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | Developer | Browse a local git repository's commit history and diff any two commits, entirely client-side. |
| [Git Remote Inspector](https://arahman200165.github.io/DUDE/tools/git-remote-inspector) | Developer | Parses pasted "git remote -v" output into a table of remote name, direction, and parsed URL. |
| [Git URL Parser](https://arahman200165.github.io/DUDE/tools/git-url-parser) | Developer | Parses a git remote URL (https, ssh://, git://, or the scp-like git@host:owner/repo form) into host, owner, and repo. |
| [Gitignore Generator](https://arahman200165.github.io/DUDE/tools/gitignore-generator) | Developer | Combines curated .gitignore templates (Node, Python, Java, .NET, Go, Rust, macOS, Windows, JetBrains, VS Code) into one file. |
| [Gitignore Tester](https://arahman200165.github.io/DUDE/tools/gitignore-tester) | Developer | Tests a list of paths against pasted .gitignore rules, honoring anchoring, trailing-slash directory-only patterns, and "!" negation. |
| [Glob Pattern Tester](https://arahman200165.github.io/DUDE/tools/glob-tester) | Developer | Test a glob pattern against a list of sample paths. |
| [Hex Diff](https://arahman200165.github.io/DUDE/tools/hex-diff) | Developer | Compares two uploaded files byte-by-byte in fixed-width hex rows, highlighting which 16-byte chunks differ -- the standalone version of Directory Diff's binary drill-down. |
| [Hex Editor](https://arahman200165.github.io/DUDE/tools/hex-editor) | Developer | Interactively edits an uploaded file byte-by-byte in a hex grid with a live ASCII gutter, then downloads the modified bytes. Limited to 16 KB files to keep editing responsive. |
| [Hostname Resolver](https://arahman200165.github.io/DUDE/tools/hostname-resolver) | Developer | Show addresses selected by the Windows system resolver. |
| [HTML Entity Explorer](https://arahman200165.github.io/DUDE/tools/html-entity-explorer) | Developer | Searchable reference of common named HTML character entities, with decimal and hex codepoints. |
| [HTML Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/html-formatter) | Developer | Pretty-prints or minifies HTML by walking the parsed DOM, preserving <pre>/<script>/<style> content verbatim. |
| [HTML ↔ JSX Converter](https://arahman200165.github.io/DUDE/tools/html-jsx-converter) | Developer | Converts HTML to JSX (className, htmlFor, style objects, self-closing void tags) or JSX back to HTML, best-effort. |
| [HTML Preview](https://arahman200165.github.io/DUDE/tools/html-preview) | Developer | Live-render an HTML document — including its own inline <script>/<style> — inside a network-isolated sandbox with captured console output. |
| [Installed Software](https://arahman200165.github.io/DUDE/tools/installed-software) | Developer | Search, sort, export and review installed Windows software, with previewed interactive uninstallers and copyable Appx removal commands. |
| [IP Address Inspector](https://arahman200165.github.io/DUDE/tools/ip-address-inspector) | Developer | Inspects an IPv4 or IPv6 address — canonical form, classification (private/loopback/multicast/etc.), and binary/expanded/integer view. |
| [IPv4 ↔ Integer Converter](https://arahman200165.github.io/DUDE/tools/ipv4-integer-converter) | Developer | Converts an IPv4 address to its 32-bit unsigned integer form, or the reverse. |
| [IPv6 Explorer](https://arahman200165.github.io/DUDE/tools/ipv6-explorer) | Developer | Shows an IPv6 address's compressed and expanded forms, its classification, and any embedded IPv4 address. |
| [JavaScript Playground](https://arahman200165.github.io/DUDE/tools/js-playground) | Developer | Run JavaScript snippets in a network-isolated sandbox with captured console output, uncaught errors, and a hard execution timeout. |
| [Structured Data / JSON-LD Tester](https://arahman200165.github.io/DUDE/tools/json-ld-tester) | Developer | Validates a JSON-LD block's shape against common Schema.org types, flagging missing required/recommended properties. |
| [Kubernetes CronJob Schedule Tester](https://arahman200165.github.io/DUDE/tools/k8s-cronjob-tester) | Developer | Extracts a CronJob's schedule from a pasted manifest (or accepts a bare cron expression) and shows its next run times. |
| [Kubernetes Manifest Diff](https://arahman200165.github.io/DUDE/tools/k8s-manifest-diff) | Developer | Diffs two Kubernetes manifests, reporting added, removed, and changed fields. |
| [Kubernetes Manifest YAML Validator / Formatter](https://arahman200165.github.io/DUDE/tools/k8s-manifest-validator) | Developer | Validates a Kubernetes manifest for required fields (apiVersion, kind, metadata.name) against a curated common-Kind list, and reformats its YAML. |
| [Kubernetes Quantity Converter](https://arahman200165.github.io/DUDE/tools/k8s-quantity-converter) | Developer | Converts a Kubernetes resource quantity (e.g. "500m", "1Gi") to its canonical value and every other common unit at once. |
| [Kubernetes Resource Requests Calculator](https://arahman200165.github.io/DUDE/tools/k8s-resource-calculator) | Developer | Sums container CPU/memory requests and limits across a Pod, Deployment, or other workload manifest. |
| [Kubernetes Base64 Secret Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/k8s-secret-base64) | Developer | Encodes plaintext key/value pairs into a Secret data: block, or decodes an existing Secret's base64 values back to plaintext. |
| [KSUID Generator / Inspector](https://arahman200165.github.io/DUDE/tools/ksuid-tools) | Developer | Generates a KSUID, and inspects an existing KSUID to decode its embedded timestamp and random payload. |
| [kubeconfig Inspector](https://arahman200165.github.io/DUDE/tools/kubeconfig-inspector) | Developer | Summarizes a kubeconfig's clusters, contexts, and users, redacting credential fields (tokens, client certs/keys, passwords) behind a reveal toggle. |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | Developer | Open files of any size on disk without loading them: paged hex view with offset jumps, line-numbered text view, streaming text/regex/byte find, tail -f follow, and range hashing or export. |
| [Continuous Ping / Latency Graph](https://arahman200165.github.io/DUDE/tools/latency-monitor) | Developer | Monitor ICMP latency over a bounded interval. |
| [Local Network Viewer](https://arahman200165.github.io/DUDE/tools/local-network) | Developer | Inspect bound ports, connections, listeners, neighbors, routes, interfaces, and local addresses. |
| [Lockfile Inspector](https://arahman200165.github.io/DUDE/tools/lockfile-inspector) | Developer | Parses a package-lock.json, pnpm-lock.yaml, or yarn.lock into a searchable table of resolved package versions and their dependencies. |
| [MAC Address Inspector](https://arahman200165.github.io/DUDE/tools/mac-address-inspector) | Developer | Normalizes a MAC address across colon/hyphen/Cisco-dotted/plain formats, decodes its unicast/multicast and administration bits, and looks up its OUI vendor. |
| [Mach-O Header Viewer](https://arahman200165.github.io/DUDE/tools/macho-header-viewer) | Developer | Parses a macOS/iOS Mach-O binary's mach_header, load commands, and linked dylibs (with versions) -- including fat/universal binaries, listing each architecture slice and drilling into the first. |
| [Matrix Calculator](https://arahman200165.github.io/DUDE/tools/matrix-calculator) | Developer | Adds, subtracts, multiplies, transposes, inverts, or finds the determinant of matrices entered as rows of numbers. |
| [Meta Tag Generator](https://arahman200165.github.io/DUDE/tools/meta-tag-generator) | Developer | Builds a <head> meta tag block from title/description/viewport/charset/robots/canonical fields. |
| [Missing Environment Variable Detector](https://arahman200165.github.io/DUDE/tools/missing-env-var-detector) | Developer | Cross-checks environment variables referenced in source code against a .env file's declared keys, in both directions. |
| [Mock Data Studio](https://arahman200165.github.io/DUDE/tools/mock-data-studio) | Developer | Generates schema-driven mock data by mapping field names to faker methods, exported as JSON, NDJSON, CSV, SQL, XML, or YAML. |
| [Model Generator (JSON → Code)](https://arahman200165.github.io/DUDE/tools/model-generator) | Developer | Infers a type shape from sample JSON and generates a TypeScript, C#, Java, Kotlin, Swift, Python, Rust, Go, or SQL model. |
| [MTU Discovery](https://arahman200165.github.io/DUDE/tools/mtu-discovery) | Developer | Probe path MTU for an explicit IPv4 or IPv6 target. |
| [NanoID Generator](https://arahman200165.github.io/DUDE/tools/nanoid-generator) | Developer | Generates NanoIDs with a configurable count, length, and alphabet. |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | Developer | Collect selected checks and export a reviewed diagnostic ZIP. |
| [Number Theory Toolkit](https://arahman200165.github.io/DUDE/tools/number-theory-toolkit) | Developer | Modular arithmetic (including modular inverse), GCD/LCM of a list, and prime checking/factorization. |
| [Numeric Representation Inspector](https://arahman200165.github.io/DUDE/tools/numeric-representation-inspector) | Developer | Inspects a value's byte-order (endianness), IEEE-754 float bit layout, or integer representation across bit widths. |
| [OpenGraph Preview](https://arahman200165.github.io/DUDE/tools/opengraph-preview) | Developer | Builds og:/twitter: meta tags and renders a live social-card preview, entirely from entered values -- no URL fetching. |
| [Package Metadata Inspector](https://arahman200165.github.io/DUDE/tools/package-metadata-inspector) | Developer | Looks up a package's latest version, description, license, and dependency count on npm, PyPI, crates.io, or NuGet. |
| [Packet-Loss Measurement](https://arahman200165.github.io/DUDE/tools/packet-loss) | Developer | Measure ICMP packet loss over a bounded probe sample. |
| [PATH Editor](https://arahman200165.github.io/DUDE/tools/path-editor) | Developer | Edit the user and machine PATH with per-entry checks (missing, duplicate, unresolved, relative, quoted, not a folder), reorder and de-duplicate through a previewed, confirmed change, and see which executables shadow which (which node, git or java wins). |
| [PE Header Viewer](https://arahman200165.github.io/DUDE/tools/pe-header-viewer) | Developer | Parses a Windows PE executable's DOS/COFF/Optional headers, section table, data directories, imports and delay-load imports, exports (ordinal and forwarded), version resource, Authenticode presence, CLR header and PDB/CodeView debug data into a browsable tree. |
| [Percentage & Ratio Calculator](https://arahman200165.github.io/DUDE/tools/percentage-ratio-calculator) | Developer | Percentage of, percent-of-what, percent change, ratio simplification, and proportion solving. |
| [Ping](https://arahman200165.github.io/DUDE/tools/ping) | Developer | Send ICMP echo requests and show round-trip latency. |
| [Pixel Color Picker](https://arahman200165.github.io/DUDE/tools/pixel-color-picker) | Developer | Reads the exact color of any pixel in an uploaded image. |
| [Port → Process Lookup](https://arahman200165.github.io/DUDE/tools/port-process-lookup) | Developer | Find which process owns a port: a live, filterable table of every TCP and UDP socket joined to its owning process. Type 3000 to see who is using :3000, open the owner in Process Viewer, or end it through a previewed, confirmed change. |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | Developer | Probe a bounded TCP and UDP port set on one host or CIDR. |
| [PowerShell Builder](https://arahman200165.github.io/DUDE/tools/powershell-builder) | Developer | Build PowerShell 7 commands from the real cmdlet catalog (parameter sets, types, ValidateSet), or write a script by hand, review the exact text with its SHA-256, and run it only after an explicit confirmation. |
| [Process Diagnostic Bundle](https://arahman200165.github.io/DUDE/tools/process-diagnostic-bundle) | Developer | Collect everything about one running Windows process into a single ZIP for a bug report or support case: summary, process tree, command line, environment, modules with versions and signers, threads, handles, ports, related Event Log entries, CPU and memory samples and a minidump. Every section shows its fields and size first and can be switched off. |
| [Process Viewer](https://arahman200165.github.io/DUDE/tools/process-viewer) | Developer | Task manager for Windows: live CPU and memory, a parent/child process tree, and per-process command line, environment (with diffs and snapshots), modules with versions and signers, threads, handles and ports. End, restart, suspend, reprioritise or dump a process through a previewed, confirmed change. |
| [Programmer Calculator](https://arahman200165.github.io/DUDE/tools/programmer-calculator) | Developer | Arithmetic and bitwise (AND/OR/XOR/NOT/shift) calculator with an interactive bit grid, two’s-complement, and 8/16/32/64-bit widths. |
| [Public IP Detector](https://arahman200165.github.io/DUDE/tools/public-ip) | Developer | Detect public IPv4 and IPv6 addresses on explicit request. |
| [Python Playground](https://arahman200165.github.io/DUDE/tools/python-playground) | Developer | Run Python in the browser via Pyodide (WebAssembly CPython) — no network calls once the runtime is cached. |
| [Random Data Generator](https://arahman200165.github.io/DUDE/tools/random-data-generator) | Developer | Generate realistic fake data — names, addresses, internet, finance, and more — as a table, CSV, or JSON. |
| [Range Generator](https://arahman200165.github.io/DUDE/tools/range-generator) | Developer | Generates a numeric sequence from a start, end, and step, with zero-padding and newline/comma/JSON output. |
| [Regex Tester](https://arahman200165.github.io/DUDE/tools/regex) | Developer | Test a regular expression against text with match/capture-group details, a plain-English explainer, cross-language flavor notes, and a replace mode. |
| [Regex Benchmark](https://arahman200165.github.io/DUDE/tools/regex-benchmark) | Developer | Flags catastrophic-backtracking risk shapes in a pattern, and times it against sample inputs in a worker with a per-sample timeout. |
| [Regex Flavor Converter](https://arahman200165.github.io/DUDE/tools/regex-flavor-converter) | Developer | Translates a regex pattern between JavaScript, Python, Java, .NET, PCRE, and Go RE2 syntax, flagging constructs the target flavor cannot represent. |
| [Regex Generator](https://arahman200165.github.io/DUDE/tools/regex-generator) | Developer | Generalizes a pattern from example strings (non-AI, heuristic), validated against every example and counter-example before being shown. |
| [Regex Visualizer](https://arahman200165.github.io/DUDE/tools/regex-visualizer) | Developer | Renders a regular expression as a railroad syntax diagram. |
| [Registry Editor](https://arahman200165.github.io/DUDE/tools/registry-editor) | Developer | Browse the Windows registry lazily, view values by type, search keys, value names and data with a bounded scan, export .reg files, diff a key against a snapshot or a .reg file, and create keys or set and delete values through a previewed, confirmed change. |
| [Reverse DNS Lookup](https://arahman200165.github.io/DUDE/tools/reverse-dns) | Developer | Resolve an IP address to PTR records. |
| [Route Comparison](https://arahman200165.github.io/DUDE/tools/route-comparison) | Developer | Compare two network traces or before and after traces. |
| [Runtime Detector](https://arahman200165.github.io/DUDE/tools/runtime-detector) | Developer | Find every installed developer runtime (Git, Node, Python, Java, .NET, Go, Rust, Docker and more) from PATH, known folders and the registry, see where each lives and which version manager shims it, and spot version conflicts. Live version probes run only when you preview and confirm them. |
| [Scheduled Tasks](https://arahman200165.github.io/DUDE/tools/scheduled-tasks) | Developer | Inspect Windows scheduled tasks, triggers, actions, principals and run results. Enable or disable a task through a previewed system change. |
| [Scientific Notation Converter](https://arahman200165.github.io/DUDE/tools/scientific-notation-converter) | Developer | Converts a number between standard, scientific, and engineering notation with adjustable significant digits. |
| [Secret Detector](https://arahman200165.github.io/DUDE/tools/secret-detector) | Developer | Flags likely credentials and keys in pasted text or config — AWS/GitHub/Slack tokens, PEM private keys, JWTs, generic key=value assignments, and high-entropy strings. |
| [Semantic Version Comparator](https://arahman200165.github.io/DUDE/tools/semver-comparator) | Developer | Compare, sort, and range-check versions against the Semantic Versioning spec. |
| [Services Viewer](https://arahman200165.github.io/DUDE/tools/services-viewer) | Developer | Windows services with live state, startup type, account and binary path, plus dependency and dependent trees (copyable as Mermaid). Start, stop, restart or change the startup type of a service through a previewed, confirmed change that lists the dependents a stop would take down. |
| [Snowflake ID Generator / Inspector](https://arahman200165.github.io/DUDE/tools/snowflake-id-tools) | Developer | Generates a Snowflake id (Twitter/X, Discord, Instagram, or custom epoch/bit layout), and inspects an existing id to decode its embedded timestamp, worker id, and sequence. |
| [Stack Trace Formatter](https://arahman200165.github.io/DUDE/tools/stack-trace-formatter) | Developer | Auto-detects and cleans up a Java, .NET, JavaScript, or Python stack trace, tagging library frames and Caused-by/inner-exception chains. |
| [Startup Programs](https://arahman200165.github.io/DUDE/tools/startup-programs) | Developer | Inspect Windows logon startup entries, startup folders, tasks and auto-start services; change supported StartupApproved states through a reviewed system plan. |
| [Statistics Calculator](https://arahman200165.github.io/DUDE/tools/statistics-calculator) | Developer | Count, sum, mean, median, mode, range, quartiles/IQR, and population/sample variance and standard deviation. |
| [Subnet Calculator](https://arahman200165.github.io/DUDE/tools/subnet-calculator) | Developer | Splits an IPv4 network into a chosen number of equal subnets, or into subnets of a given prefix length. |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Developer | Journal of every Windows system change DUDE applied — processes, environment variables, registry, services, tasks, startup entries, features and permissions — with per-change outcomes, previewed undo, backups, retention, and the snapshot library. |
| [TCP Port Tester](https://arahman200165.github.io/DUDE/tools/tcp-port-tester) | Developer | Test one TCP port on an explicit host. |
| [Template Renderer](https://arahman200165.github.io/DUDE/tools/template-renderer) | Developer | Render an EJS template against a JSON data context in a network-isolated sandbox, using the same execution engine as the JavaScript Playground. |
| [Traceroute](https://arahman200165.github.io/DUDE/tools/traceroute) | Developer | Trace the network path to an explicit host. |
| [UDP Port Tester](https://arahman200165.github.io/DUDE/tools/udp-port-tester) | Developer | Probe one UDP port and show conclusive or inconclusive results. |
| [ULID Generator / Inspector](https://arahman200165.github.io/DUDE/tools/ulid-tools) | Developer | Generates a ULID (optionally monotonic), and inspects an existing ULID to decode its embedded timestamp and randomness component. |
| [UUID Generator / Inspector](https://arahman200165.github.io/DUDE/tools/uuid) | Developer | Generate v1/v3/v4/v5/v6/v7 UUIDs (with namespace support), inspect an existing UUID and its embedded timestamp, and bulk-export the generated list. |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | Developer | Watch remembered folders in the background while DUDE runs and keep a searchable timeline of created, modified, deleted and renamed files — with notifications and optional before/after content capture. |
| [WHOIS Lookup](https://arahman200165.github.io/DUDE/tools/whois-lookup) | Developer | Query RDAP registration data with classic WHOIS fallback. |
| [Windows Features](https://arahman200165.github.io/DUDE/tools/windows-features) | Developer | Inspect Windows optional features and Features on Demand, and preview elevated enable or disable changes. |
| [Aspect Ratio Calculator](https://arahman200165.github.io/DUDE/tools/aspect-ratio-calculator) | Documents | Simplifies a width/height pair to its lowest-terms ratio (e.g. 1920x1080 -> 16:9), or solves for a missing width/height given a target ratio. |
| [DPI Calculator](https://arahman200165.github.io/DUDE/tools/dpi-calculator) | Documents | Converts between pixel dimensions, physical print size, and DPI -- find the DPI of an image at a given print size, the pixels needed for a target DPI, or the print size a given pixel count supports. |
| [EXIF Viewer / Cleaner](https://arahman200165.github.io/DUDE/tools/exif-viewer) | Documents | Views an image's embedded EXIF metadata, or strips it entirely by re-encoding the image through canvas. |
| [Image Compressor](https://arahman200165.github.io/DUDE/tools/image-compressor) | Documents | Compresses an uploaded image to JPEG, WebP, or PNG with an adjustable quality level and a before/after size comparison. |
| [Image Cropper](https://arahman200165.github.io/DUDE/tools/image-cropper) | Documents | Drag-selects a crop area on an uploaded image and exports the cropped region. |
| [Image Format Converter](https://arahman200165.github.io/DUDE/tools/image-format-converter) | Documents | Converts an uploaded image between PNG, JPEG, WebP, and AVIF (where the browser supports encoding it). |
| [Image Metadata Inspector](https://arahman200165.github.io/DUDE/tools/image-metadata-inspector) | Documents | Reports an uploaded image's file size, detected format, pixel dimensions, and (for PNG) bit depth and color type. |
| [Image Resizer](https://arahman200165.github.io/DUDE/tools/image-resizer) | Documents | Resizes an uploaded image to explicit dimensions or a percentage scale, with optional aspect-ratio lock. |
| [Markdown Preview](https://arahman200165.github.io/DUDE/tools/markdown) | Documents | Live side-by-side Markdown editor and sanitized HTML preview, with style presets and custom CSS. |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Documents | Markdown editor with GFM tables/task lists, front matter, table of contents, synced preview, style presets/custom CSS, and a sandboxed plugin API. |
| [Resolution Calculator](https://arahman200165.github.io/DUDE/tools/resolution-calculator) | Documents | Converts a pixel resolution (custom or a named preset like 1080p/4K) into megapixel count and simplified aspect ratio. |
| [Rich Text Editor](https://arahman200165.github.io/DUDE/tools/rich-text-editor) | Documents | WYSIWYG editor with sanitized HTML and Markdown export. |
| [SVG Viewer / Formatter / Optimizer](https://arahman200165.github.io/DUDE/tools/svg-viewer) | Documents | Previews SVG markup and formats, minifies, or optimizes it (via SVGO). |
## Architecture

The shell is generated entirely from tool metadata — no file under `src/app/shell/` or `src/app/core/` contains a single hard-coded tool ID. Adding a tool means creating a folder under `src/app/tools/` with a colocated `<id>.manifest.ts` declaring its metadata; a generator script (`npm run generate:registry`) assembles every tool's manifest into the registry, and the sidebar, deck, search, command palette, and routes all update automatically. Transformation Pipelines (`src/app/shell/pipelines/`, `src/app/core/pipeline/`), Smart Paste (`src/app/shell/smart-paste/`, `src/app/core/paste-detect/`), the Workspace (`src/app/shell/workspace/`, `src/app/core/workspace/`), Local History (`src/app/shell/history/`, `src/app/core/history/`), Quick Run (`src/app/shell/quick-run/`), Projects (`src/app/shell/projects/`, `src/app/core/project/`), deep links (`src/app/core/deep-link/`), Settings (`src/app/shell/settings/`), Browse Tools (`src/app/shell/browse-tools/`), and the user-designed Home (`src/app/shell/deck/home-canvas/`, `src/app/core/home-layout/`) are the deliberate exceptions: composing tools into a chained workflow, recognizing pasted content, mounting more than one tool at once in tabs/panels, recording a cross-tool history, running a tool's transform in place, bundling saved layouts, resolving `dude://` links, app-wide preferences, and a dedicated searchable/filterable/sortable catalog of the complete registry all change what "using a tool" means rather than adding one, so these are the only features allowed to add their own routes and sidebar entries (tools contribute their own Settings panels through a manifest `settingsSection`, never by editing `shell/settings/`; features contribute Home panels through a colocated `<kind>.panel-manifest.ts` that `npm run generate:registry` assembles into `core/registry/panel-definitions.ts`, never by editing Home — see `ADDING_A_TOOL.md` and the Home/Workbench shell contract in `src/app/shell/deck/AGENTS.md`) — in every case, a tool id referenced is still just data resolved generically through the registry, never hard-coded.

```
src/app/
  core/
    registry/      tool metadata, the registry service, search, route generation
    persistence/    per-tool session/local/none storage policy
    workers/        the shared Worker request/result/cancel contract
    connectivity/   online/offline signal, update-available detection
    routing/        the one root route table (lazy-loads every tool)
    pipeline/       Transformation Pipelines engine — step contract, resolution, validation, execution, saved pipelines/scripts
    workspace/      Persistent Workspace — the shared <id>.workspace-step.ts adapter, tab/panel layout, scratchpad
    history/        Persistent Local History — IndexedDB store, retention, click-to-restore
    storage/        generic Promise-wrapped native IndexedDB helpers, shared by history/
  shell/            sidebar, deck, command palette, root layout, and pipelines/ + smart-paste/ + workspace/ + history/ + quick-run/ + projects/ + settings/ + browse-tools/ (the sanctioned exceptions — see above)
  shared/           tool-shell frame, error panel, split-pane, tree-view, data-table, copy-button, key-value-editor, and other cross-tool primitives
  tools/            one folder per tool — pure logic + component, isolated from every other tool
```

Key design choices:

- **Per-tool persistence policy** (`none` / `session` / `local`) — sensitive tools like the JWT Debugger persist nothing by default; UI preferences like indent size persist locally.
- **Shared worker layer** — heavy or unbounded work (hashing, regex, diffing, large JSON) can opt into a Web Worker without each tool reinventing message-passing, cancellation, or error handling.
- **Failure isolation** — a worker crash or a tool bug stays inside that tool's route; the sidebar and navigation keep working.
- **Lazy loading** — every tool is a separate `loadComponent` chunk, so visiting one tool never downloads another's code or libraries.
- **Appearance is generated from one token file** — `src/styles/theme/theme-tokens.json` is the single source for every theme, contrast mode, accent, palette set, density and font stack; `scripts/generate-theme-css.mjs` turns it into plain CSS custom properties keyed by `data-*` attributes on `<html>`, which an inline pre-paint script sets before first paint and `core/appearance/` owns afterwards. Tools and shell use only theme tokens, and `npm run lint` proves the palette's WCAG contrast across all 144 color combinations. The choice is global to the device (live across tabs), exportable as a `*.dude-theme.json` file, and on desktop also drives the native window theme and background.
- **Workspace/History never outlive a tool's own persistence policy** — tab/panel layout is metadata-only (which tools, in what arrangement) and always persists; a tool's actual content only ever reappears (across a tab switch, a full relaunch, or a History restore) because that tool's own `PersistenceService.signal(...)` policy already allowed it, never because either feature promoted or copied it.

See [`ADDING_A_TOOL.md`](ADDING_A_TOOL.md) for the full, step-by-step guide to adding a new tool, written against the real `base64` tool as a worked example.

The Phase 29 filesystem boundary lives under `electron/`: `fs-grants.ts` owns session and remembered picker grants; `fs-worker.ts` runs the streamed walker and heavy jobs in an Electron utility process; `fs-mutation.ts` validates previewed plans, applies operations and keeps journal/undo backups; `fs-watch-service.ts` owns opt-in background watches. The renderer reaches them only through the preload bridge and generic platform services. Pure filters and filesystem types live in `src/shared-logic/fs/`; streaming hash logic lives in `src/shared-logic/hash-compute.ts`. The renderer, main process and utility process use those shared rules.

## Tech stack

Angular 22 (standalone components, signals) · Tailwind CSS v4 · Vitest · Playwright · `@angular/service-worker` · TypeScript · Electron (Windows desktop build)

Library-forward by design — Markdown rendering, diffing, sanitization, color-space math, slug transliteration, structured-data parsing, cron scheduling, and User-Agent parsing all lean on mature libraries (`markdown-it`, `diff-match-patch`, `dompurify`, `colord`, `@sindresorhus/slugify`, `js-yaml`, `fast-xml-parser`, `papaparse`, `jsonpath-plus`, `jmespath`, `cron-parser`, `cronstrue`, `ua-parser-js`, `fflate` for ZIP's DEFLATE + central-directory format, and `iconv-lite` for Phase 29 text transcoding in the Electron fs worker only) rather than reimplementing them. Gzip/deflate in the Compression Lab and TAR/TAR.GZ's own layout lean on the native Compression Streams API and a small hand-rolled USTAR reader/writer instead, since neither is fiddly enough to justify a dependency. The desktop build's real-time collaboration (Phase 8 Stage 6/7) is the same story: `yjs`/`y-protocols`/`lib0` for CRDT sync/awareness, `ws` for the WebSocket transport, rather than hand-rolling a conflict-resolution protocol — as is its packaging and update pipeline (Stage 8): `electron-builder` for the NSIS/MSIX installers and `electron-updater` for the update check/download/install flow, rather than a hand-rolled installer or update mechanism. The shared workbench chart primitive (Phase 30C.3 — a sparkline and horizontal ranked bars for Home's activity insights) leans on `echarts` via its tree-shaken `echarts/core` build (only the Canvas renderer plus the line/bar chart and grid/tooltip components are registered) rather than hand-rolling chart rendering, and loads it through a dynamic `import()` on first use so no tool or shell chunk pays its cost unless a chart actually renders. The Home layout's optional drag-and-resize surface (Phase 30I) leans on `gridstack` (exact-pinned, MIT) behind a thin adapter and imported only inside the Settings editor, so it is never part of the Home or initial bundle; the grid math itself (snapping, collisions, narrow derivation) is a small pure module with no dependency.

## Getting started

```bash
git clone https://github.com/arahman200165/DUDE.git
cd DUDE
npm install
npm start
```

Open `http://localhost:4200/`. The app reloads automatically as you edit source files.

## Building

```bash
npm run build
```

Production output goes to `dist/dude/browser`, optimized and with the service worker enabled.

## Testing

```bash
npm test         # Vitest unit tests — registry, persistence, worker wrapper, tool transforms, keyboard nav
npm run test:e2e # Playwright, against a real production build: SPA-fallback routing + PWA offline behavior
npm run test:appearance # Playwright appearance matrix: every theme/contrast/accent/palette/density/motion combination, production build
npm run lint     # ESLint boundary rules (src/app/ <-> electron/ <-> src/shared-logic/) + check:design (design tokens, generated theme CSS freshness, WCAG theme-contrast matrix)
```

Testing follows a "protect the framework, not chase coverage" posture: pure transforms have unit tests, registry-wide web/desktop parity compares pipeline steps, and Playwright exercises production routing, caching, sharing, bundle restore, and PWA behavior.

## Deployment

Every push to `master` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml): install, test, build, then publish `dist/dude/browser` to GitHub Pages via `actions/deploy-pages`.

Two details make clean, bookmarkable routes work correctly on GitHub Pages' static hosting:

- **Base path** — the production build is configured with `baseHref: '/DUDE/'` (see `angular.json`) to match the project-page URL structure.
- **SPA fallback** — GitHub Pages has no server-side rewrite, so a direct hit or refresh on e.g. `/DUDE/tools/json` would 404. [`public/404.html`](public/404.html) catches that 404 and redirects into `index.html` with the original path encoded in the query string, which `index.html` then decodes and hands to the Angular router before it boots. This is exercised end-to-end by `e2e/production-direct-route.spec.ts` against the real built output.

Live site: **[arahman200165.github.io/DUDE](https://arahman200165.github.io/DUDE/)**

## PWA & Offline

The GitHub Pages build is an installable PWA. Its small app shell is prefetched; tool chunks and optional Pyodide, sql.js, xmllint, and EJS runtimes download when first needed. The production build generates an `offline-map.json` for per-tool readiness, enforces an 800 kB shell-prefetch budget, and checks that every built asset belongs to a service-worker group.

**Prepare for offline work:** open **Settings → Web & Offline**. It shows storage usage, persistence status, and cached runtime sizes. **Make available offline** previews the download size for a tool, a category, or all tools before fetching; progress can be cancelled. A previously visited tool can also be ready without using this action. Offline discovery dims uncached tools, and a direct load explains how to cache them. Network-dependent features still require a connection; the tool's other local modes remain available where supported. See [Security](docs/SECURITY.md) for network disclosures and the [capability matrix](#web-vs-desktop-capability-matrix) for desktop-only features.

**Install:** use **Install app** in Web & Offline when the browser offers it, or the browser's install control. The generated manifest provides shortcuts to common tools, supported file types, and a `web+dude` protocol handler where the browser supports them. The home deck offers a one-time install hint. The page ships light- and dark-scheme `theme-color` metas and, once loaded, replaces them with one carrying the chosen theme's background. The web manifest's `theme_color`/`background_color` stay dark, because the manifest format has no per-color-scheme member — a known limitation for anything the browser paints from the manifest before the page loads.

**Share and open in desktop:** a tool header can copy its bare route. Text-input tools also offer **Copy link with input**; the compressed text lives in the URL fragment and is limited to 8 KB. Anyone with that URL can read the input, so use the bare link for sensitive text. **Open in Desktop DUDE** launches a navigation-only `dude://` link and offers GitHub Releases if the app is not detected. No file or saved state crosses that link; state handoff belongs to Phase 59.

**Manage caches:** Web & Offline can clear an optional runtime or repair the service-worker installation. Both actions preview the affected cache entries and require a separate Confirm. They leave saved inputs, preferences, workspaces, and pipelines intact. DUDE prompts before applying an available update; a stale or unrecoverable install offers repair.

**Test locally:** the service worker is enabled in a production build, not `ng serve`. `npm run test:e2e` builds the app and runs Chromium against the same `/DUDE/` path and 404 fallback used on GitHub Pages. For manual inspection, run `npm run build`, then from `e2e/` run `node scripts/prepare-static-site.mjs` followed by `node scripts/static-server.mjs`, and open `http://localhost:4310/DUDE/`. DevTools Offline can then check cached and uncached routes.

## Adding a new tool

Read [`ADDING_A_TOOL.md`](ADDING_A_TOOL.md) — it walks through creating a tool folder, defining metadata, choosing a persistence/worker/network policy, and verifying discovery, using the real `base64` tool as the worked example. If following it ever requires editing the shell, routing, or a core service, that's an architecture bug, not something to work around.

## License

[MIT](LICENSE) © arahman200165
