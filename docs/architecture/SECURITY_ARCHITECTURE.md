# DUDE Security Architecture

This specification owns trust boundaries and authorization. Device enrollment enables identity and synchronization; it does not authorize privileged remote execution. Existing native mutation protections remain mandatory throughout the distributed transition.

Workspace implementation and host ownership are documented in [Portable Core](PORTABLE_CORE.md#package-and-host-boundaries). The Hub, owner identity, device registry and desktop sync are delivered. Phase 31H adds Android-specific security adapters with [remaining acceptance passes carried into the Phase 31I gate](../delivery/PHASE31H_ACCEPTANCE.md).

## As built in Phase 31H: Android identity and recovery

Enrollment is explicit paste/QR input followed by review of endpoint, name, SPKI pin and privacy disclosure. Camera permission is requested only when scanning; denial retains paste. Owner login and pairing-code creation remain on existing owner surfaces. Navigation links cannot enroll or execute. Devices register `platform: android`, advertise only `secure-storage` and keep recovery trust off. Existing key-bearing internal `desktop` device-kind compatibility is preserved without granting desktop privileges.

The dedicated Kotlin HTTPS/WebSocket client verifies the approved leaf SPKI during TLS authentication before application bytes. Active/next pins and approved reverse-proxy pins remain confined to this client. No process-wide trust override, cleartext request or redirect is allowed. Requests are bounded to 15 seconds and HTTP responses to 4 MiB; diagnostics exclude credentials and request/response payloads. Private, VPN and public connectivity use the same reviewed trust identity, with physical off-LAN and rotation acceptance still required.

Bouncy Castle Ed25519 signing uses an AES-GCM wrapping key in Android Keystore. Decrypted signing seeds stay in Kotlin and never cross JavaScript. JavaScript receives opaque key references, public keys and signatures. Short-lived device tokens remain in memory and renew through a single-flight signed challenge; expiration is distinguished from confirmed revocation. Before enrollment, durable storage records only endpoint/pins, public identity, expected authority and key reference. Pairing codes, proofs, tokens and request bodies are excluded; an ambiguous enrollment response recovers the same registration through a signed challenge or requests pairing input again.

The application-private SQLite database is not encrypted with SQLCipher. Native backup/device-transfer rules exclude databases, credential material and recovery copies. Missing Keystore material never silently generates a replacement enrolled identity; explicit recovery/re-pair preserves cached records and pending operations. Credential-free recovery export omits key references, keys, tokens and enrollment secrets, but contains personal cached state and must be handled accordingly.

Committing a new enrollment atomically records superseded signing-key references for deletion. A failed native deletion leaves a visible cleanup warning and retries on recovery or reopen; the runtime still adopts the committed identity. Sessions bearing the old key reference or public key cannot overwrite that enrollment. Cleanup references are private metadata and do not appear in recovery exports.

Local lifecycle actions use expiring single-use confirmations bound to action, active context, revisions, pending work and relevant enrollment state. Disconnect, cache clearing, pending-attempt discard and conversion cross the destructive-action boundary; Use Hub takes a recovery copy before replacing values. Remote events may freeze revoked data but cannot mint or consume local confirmation tokens. Recovery exports and archived data remain separate from standalone state until explicit previewed conversion.

Protected preview signing keys are CI secrets in `android-preview`; local release packaging requires an explicit keystore path and passwords. Missing signing configuration fails packaging without a debug-key fallback. Disposable emulator acceptance keys do not prove distributable preview signing. The existing release writer alone attaches APK/AAB/checksums to a draft; no Play publication or OTA update channel is configured.

## As built in Phase 31I: Android tool permissions and input boundaries

Android tools add input paths but no new credential, enrollment or network capability. A tool screen reaches no Hub API, and tool inputs and outputs do not become syncable data by passing through it.

**Permissions.** The merged release manifest requests `CAMERA`, `INTERNET`, `VIBRATE` and `ACCESS_NETWORK_STATE`, plus AndroidX's non-exported-receiver signature permission. The config plugin removes, with `tools:node="remove"`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`, every `READ_MEDIA_*` permission, `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` and `ACCESS_WIFI_STATE` (a library merges the last one in); the native privacy test asserts the list. `expo-image-picker` is configured with photo and microphone permissions off and uses the Android Photo Picker. A new permission is a security decision recorded here, not a dependency side effect.

**Camera.** Only the QR Code Scanner and Barcode Reader use the camera. Permission is requested only when the user taps Scan, scanning is single-shot, and denial leaves the paste and image paths working. The enrollment scanner keeps its own separate path. Emulators exercise paste, image and denial only, so camera decoding needs the physical-phone pass.

**Photo Picker and files.** Scan-from-image uses the Photo Picker through `scanFromURLAsync`, so no media permission is needed. Text file open uses the Storage Access Framework document picker: the app receives one user-chosen document, copies it to the app cache, size-checks it against the 2 MiB default before and after reading, rejects binary, UTF-16 or oversized files and deletes the cache copy afterwards. Save asks the user to pick a destination folder through the SAF directory picker and writes one sanitized file name into it; it never writes to shared storage by path. Share uses the system share sheet, and generated images are written to the app cache before sharing.

**Share-to-DUDE.** The manifest declares an `ACTION_SEND` filter for `text/plain`, `text/*`, `application/json`, `image/*`, `application/x-pem-file`, `application/pkix-cert`, `application/x-x509-ca-cert` and `application/octet-stream`. The `dude-share` module reads only `content:` URIs (a `file:` URI is refused), enforces the cap on the declared size and on the streamed bytes, and accepts text only when it is strict UTF-8 without NUL. It never logs content. Previews of secret-like shapes (JWT, `.env`, private keys, Bearer and Basic credentials) are redacted. Images route only to the two scanners. A shared payload is never auto-run, persisted or synchronized, and deep links remain navigation-only: they cannot enroll, import input or execute a tool.

**Sensitive scan payloads.** The portable classifier flags Wi-Fi passwords and `otpauth` secrets as `sensitive` and supplies a redacted form. The scanner screens show the redacted form with an explicit Reveal control, hold the value only in memory and never write it to the preference store, Recents, the outbox or an export. The classifier recognizes the shape; it does not act on it.

**URL open confirmation.** A URL found in a scan opens only after a second tap on a confirmation card that shows the full target. There is no automatic open and opening is not part of any transform.

**Workers and engine failure.** The off-thread worker has no `URL`, random source or native module, so a task cannot reach a capability its screen does not hold. `request`, `compression`, `sanitizeHtml`, `htmlEntities`, `decodeImage` and `xxhash` throw `HostFacilityUnavailableError` instead of falling back to a weaker implementation. An engine failure stays behind the tool error boundary and never reaches the shell.

**Device Info.** Android reports facts from React Native, `expo-device`, `expo-network` and `expo-constants`. It never reports a device name, serial number, Android ID, IP address, MAC address or SSID, and the desktop `dude:deviceInfo:osFacts` IPC returns only platform, OS name and release, architecture, CPU model and count, and total memory. The channel is read-only and carries no path, user name or environment value.

Read [the master PRD](../DUDE_PRD.md) first. Product direction and invariants live there; this document owns the detailed contracts in its domain.

Related: [DUDE System Architecture](SYSTEM_ARCHITECTURE.md) · [Data, Persistence and Synchronization](DATA_SYNC_ARCHITECTURE.md) · [Quality and Release Specification](../delivery/QUALITY_AND_RELEASE.md) · [DUDE UX Specification](../product/UX_SPEC.md).

## Contents

- [Threat Model](#threat-model)
- [Destructive-Action Contract](#destructive-action-contract)
- [API-key tools](#api-key-tools)
- [Default key storage](#default-key-storage)
- [Future Remote Execution](#future-remote-execution)
- [Sensitive Inputs](#sensitive-inputs)
- [Security Boundaries](#security-boundaries)
- [Internet Accessibility Without External Hosting](#internet-accessibility-without-external-hosting)
- [Hub Accessibility Modes](#hub-accessibility-modes)
- [Optional VPN-Only Deployment](#optional-vpn-only-deployment)
- [Security Release Gates](#security-release-gates)

## Threat Model

Protect user payloads and credentials across untrusted input/code, Electron renderer/native IPC, authenticated clients, Hub storage, lost devices and external services. A compromised browser session must not imply native machine control. Revocation prevents future Hub access but cannot erase an offline device’s existing cache.

The master [Durable Product Boundaries](../DUDE_PRD.md#durable-product-boundaries) prohibit silent transmission, incidental mutation, embedded private credentials and untrusted privileged execution.

## Destructive-Action Contract

Durable constraint #4 above is a principle; this is the concrete contract every `filesystem-write`, `process-management`, `registry`, `system-config`, or `database-write` tool must implement. Phase 29 is the first local implementation, through the filesystem mutation engine ([Phase 29](../history/DELIVERY_HISTORY.md#phase-29)); Phase 31 adds the second, the Windows system mutation engine ([Phase 31](../history/DELIVERY_HISTORY.md#phase-31)); later native write capabilities must meet the same boundary:

1. **Two-step confirmation.** A mutating action always has a distinct preview/dry-run step (what will change) and a separate, explicit confirm step (do it) — never a single click/keystroke that both previews and commits.
2. **No incidental triggering.** Opening a file, importing data, running a detector, or otherwise inspecting input must never itself cause the destructive effect — the mutating action must be its own deliberate user gesture, reachable only after the preview step.
3. **Consequence tagging.** The tool's manifest declares the relevant `ConsequenceClass` (`apps/web/src/app/shared/models/tool-definition.model.ts`) so it's covered by the generated High-Consequence Tool Matrix (`SECURITY.md`) and any capability-specific release gate.
4. **A confirmation-boundary test.** The tool's own spec asserts the destructive effect cannot fire without going through both steps above — this is the "Destructive-Action Harness" (Phase 23 Item 8) in practice: enforced per-tool at the point each such tool ships, not as a separate suite run against nothing.

Phase 27 applied the same shape to its non-local high-consequence checks. A `network-scanning` or `remote-write` run first gets a main-process preview. It then needs a single-use confirmation token, bound to the requesting window and the unchanged request, which expires after 60 seconds. `apps/desktop/network-bridge.spec.ts` covers that boundary, including an attempted renderer-side limit bypass. Phase 29's filesystem mutation engine is the first local implementation: it previews exact paths and preconditions, issues a 60-second single-use token bound to the requesting window and plan digest, rechecks files at apply time, journals per-operation results and supports previewed undo. Trash operations use the Recycle Bin. Engine and tool confirmation-boundary tests cover token replay, conflicts and the no-incidental-trigger rule.

Phase 31 adds the second local mutation engine, `sys-mutation`, for Windows system changes: processes, environment variables and PATH, registry values, services, scheduled tasks, startup entries, Windows features, software uninstall and ACLs. The token, digest and journal primitives were extracted from the filesystem engine into a shared `mutation-core` with no behavior change to Phase 29. Every change is a previewed plan of per-operation rows (target, before → after, elevation and conflict badges). Applying it needs a 60-second single-use token bound to the requesting window and the plan digest, and each operation re-checks its own precondition at apply time (process PID + creation time + image path, registry/env type + data hash, service state/config, task/startup enabled state, prior SDDL, feature state). A mismatch skips that operation as a conflict instead of overwriting. For critical processes and services (System, csrss, wininit, smss, lsass, services, winlogon, DUDE's own processes; critical services), the typed-name confirmation is enforced in main at `issueToken`, not only in the UI. Non-critical targets are warn-only by product choice. A plan that needs elevation is rejected at preview in a non-elevated session. Outcomes go to a journal, and reversible operations get previewed undo (itself a plan) from the System Changes route; kill, restart, uninstall, PowerShell and minidump operations are `noUndo` and need an explicit acknowledgment. Renderer-callable helper methods are a closed read-only allowlist, so a mutating helper method can only be reached through the engine. PowerShell execution (`powershell-builder`) uses the same confirmation primitives bound to the script's SHA-256, and never reruns from history. Each mutating route ships a colocated confirmation-boundary spec. The engine's new `ConsequenceClass` is `system-config`; the registry (`registry`) and process-management (`process-management`) classes are now in active use.

Phase 31B applies the same contract to DUDE's own state, which no tool manifest declares: Settings › This Device's *Clear data* and *Reset this device* (and the incompatible-store quarantine reset) are core destructive actions with a separate preview and confirm, a 60-second single-use token bound to the window and a digest of the previewed state, no incidental triggering, and confirmation-boundary specs (`store-reset.confirmation-boundary.spec.ts`, `this-device-settings.confirmation-boundary.spec.ts`) that `npm run test:high-consequence` runs explicitly.

## API-key tools

User-supplied API keys are allowed.

Rules:

- no private API key may be compiled into DUDE;
- session-only storage is the browser default;
- persistent browser storage requires explicit user opt-in and is appropriate only for integrations/payloads whose sensitivity permits it;
- desktop secrets should use the applicable `secure-local` / OS-keychain-backed credential tier when persistence is requested and available;
- **never downgrade a secret into ordinary local storage merely for implementation convenience**; if the secure storage path cannot satisfy a requirement, the feature must stay session-only/nonpersistent or receive an explicit architecture change rather than silently weakening the credential boundary;
- API-key storage is handled through shared credential/persistence abstractions rather than ad hoc tool code;
- API-backed tools should isolate key usage to the specific integration;
- the app should make it clear when a tool sends data to an external service.

## Default key storage

Default for browser-capable API tools:

- session-only.

Optional:

- explicit user opt-in to local persistence for non-sensitive configuration;
- desktop `secure-local` / OS-keychain-backed storage for secrets;
- named local secret references once Phase 51 expands the secrets workbench.

Never:

- hard-coded secret;
- silent persistent secret storage;
- **downgrading a secret from `secure-local` / OS-backed storage into ordinary local storage merely for implementation convenience**;
- silent transmission to a third-party service;
- plaintext automatic synchronization of secrets.

## Future Remote Execution

The architecture naturally enables a future feature in which the browser or phone requests an operation on a registered desktop.

Example:

| Devices view | Available future requests on Main Desktop (online) |
|---|---|
| Run on Main Desktop | Ping; traceroute; inspect process; inspect Docker; query local database; run pipeline |

Recommended communication model:

Browser or Phone submits a request to DUDE Hub, which authorizes it and dispatches it over an authenticated device channel to the DUDE Device Agent.

The Agent should maintain an outbound/established authenticated channel to the Hub.

Do not expose:

```text
192.168.x.x:12345
```

or arbitrary device-agent ports directly to the Internet.

Remote execution requires:

- explicit capabilities;
- per-device authorization;
- strong identity;
- action-level permission checks;
- replay protection;
- audit records;
- rate limiting;
- revocable tokens/devices;
- optional/mandatory local confirmation for sensitive actions;
- strict validation;
- least privilege.

Remote execution is **not required for the first DUDE 2.0 usable release**.

## Sensitive Inputs

Sensitive inputs are allowed.

The product should not block JWTs, credentials, private JSON, or similar data merely because they may be sensitive.

The framework should instead behave responsibly:

- no silent persistence by default;
- no silent network transmission;
- API-backed tools make transmission explicit;
- sensitive tools choose safer persistence defaults.

No enterprise secret-management system was in the original V1 scope. Desktop `secure-local` storage has since shipped, Phase 35/51 expands the local secrets experience, and distant enterprise/on-prem integrations may exist later. None of those changes the rule against silent persistence/transmission or plaintext automatic sync.

### Credentials and Secrets

Credential handling must be separate from ordinary synchronization.

For example, a connection definition may synchronize:

```text
Connection
name: Production DB
host: db.example
port: 5432
database: production
```

while the secret remains in each device's secure vault:

```text
Main Desktop vault
  credential for connection X

Laptop vault
  credential for connection X
```

DUDE should not automatically place raw credentials into ordinary synchronized records.

A later feature may add end-to-end encrypted credential synchronization, but it should be designed separately so the Hub does not need plaintext access to user secrets.

Preferred local secret storage should use:

- OS credential storage where possible;
- encrypted device vaults;
- no plaintext secret persistence.

Phase 31B implements this for the desktop as secret references backed by `safeStorage` ciphertext with no plaintext-returning IPC; see [Device identity and secret references](#device-identity-and-secret-references-phase-31b).

### Sensitive records across synchronized surfaces

Keep sync allowlisting separate from persistence. Never automatically upload pasted JWTs, keys, request bodies, packet captures, clipboard content, unsaved source, logs, crash recovery or tool history. An explicit Save/Share/Sync action must explain the destination, content and retention; opting in to favorites is not consent to payload synchronization.

Raw credentials must not be serialized in ordinary connection definitions, outboxes, logs, audit payloads or backup manifests. Persist secrets only through supported OS-backed/encrypted vault adapters. If a mobile/browser runtime lacks the required secure mechanism, keep the credential session-only or disable persistence; do not weaken storage to match another platform. Future E2EE credential sync needs key ownership, recovery, device enrollment/revocation and rotation design separate from ordinary Hub-readable record sync.

## Security Boundaries

### Standing rules

- no arbitrary code execution **in DUDE's own renderer/app realm** — arbitrary execution is permitted only inside an explicitly sandboxed environment such as the opaque-origin iframe/worker infrastructure from Phase 6, a future constrained plugin runtime, or another reviewed isolation boundary;
- no untrusted remote plugin/extension code receives DUDE/Desktop/native privileges merely because it was installed — future plugin/marketplace work requires manifests, capability declarations, permission display, signing/review metadata where applicable, sandboxing where possible, and a strict distinction between sandboxed vs. native-capability extensions;
- no untrusted HTML execution without sanitization outside an explicit sandbox;
- no embedded private service credentials;
- no silent user-data transmission;
- no destructive or privileged operation triggered merely by opening/importing content;
- no native operation bypassing Electron's preload/IPC boundary for convenience;
- no unauthenticated general-purpose local automation/control endpoint;
- no claims that JWT decoding verifies authenticity;
- network interception, proxies, remote commands, registry/service/process/database/container/Kubernetes mutations, automation triggers, and agentic actions must expose conspicuous state/permission/confirmation boundaries appropriate to their risk.

Phase 6's sandbox design (iframe isolation, network egress blocked via CSP, hard execution timeouts) is documented in `packages/tool-engine/src/shared/code-sandbox/code-sandbox-doc.ts` and each Phase 6 tool's own sandbox file.

Phase 31C applies the contract to the Hub and its administration. Hub-side destructive or authority-changing actions (revoke a device, sign out all other sessions, regenerate recovery codes, activate a staged TLS certificate, owner reset) use the server-side single-use ConfirmationStore: a preview returns a token that the matching confirm must present. `dude-hub purge` requires a stopped Hub, shows a preview of what will be deleted, issues a single-use token, requires a typed phrase and checks a digest of the previewed state before deleting. The desktop adds two-step flows for Disconnect, Update Hub and device-assisted owner recovery. Confirmation-boundary specs (`purge`, `devices` and `sessions` in `apps/hub`, and the desktop Settings and Hub boundary specs) belong to the high-consequence gate. Hub sync and restore, when they exist, cannot issue these tokens.

Phase 8 Stage 1 applied these standing rules to the Electron renderer (`contextIsolation` on, no `nodeIntegration`, all native access preload-mediated). Phase 31B replaced the loopback static server it originally paired with by an in-process custom scheme (see [Renderer origin and device store boundary](#renderer-origin-and-device-store-boundary-phase-31b)), so the packaged app no longer opens a listening socket to serve the renderer. Stage 6's LAN collaboration server is the deliberate exception to loopback-only binding and is protected by session-code semantics documented in the Phase 8 record.

### Renderer origin and device store boundary (Phase 31B)

- **Renderer origin.** The packaged renderer loads from the privileged custom scheme `dude-app://app/`, served in-process by main (GET/HEAD for host `app` only, path traversal rejected, no listening socket). The scheme has the standard/secure/fetch/CORS/stream/code-cache privileges and never `bypassCSP` or service-worker permission. A spike confirmed that WebCrypto, storage, `ws://` to loopback and LAN peers and the sandbox iframe CSP work from this origin, so the collaboration transport is unchanged. Node reports the origin of a custom scheme as `'null'`, so the navigation guard compares protocol and host explicitly and rejects every other host or scheme (`dude-app://evil/`, `foo://x`).
- **Sender-checked IPC.** Every store, device, secrets, AI-config and LLM handler accepts a call only from this window's own `webContents`, validates the payload with a closed schema (key and namespace patterns, a 2 MB value cap, a 1,000-item batch cap, enumerated entity types and purposes), and has a spec for the wrong-sender case.
- **LLM chat over IPC.** The AI Explain/Generate features call `dude:llm:chat`. Main reads the base URL and model from a device document and the API key by purpose, performs the request with a 120 second timeout and message/size caps, and scrubs the key from any error. The earlier loopback HTTP proxy was deleted, so there is no local HTTP endpoint carrying the key and no cross-origin call from the `dude-app://` renderer.
- **State service isolation (superseded in Phase 31C).** In 31B the SQLite store lived in an Electron utility process that main supervised over a private `MessagePort`. Phase 31C replaced that with the resident per-user Device Agent reached over an authenticated named pipe ([As built in Phase 31C](#as-built-in-phase-31c)); the renderer still never receives a handle, a path or a channel, the process still imports neither `electron` nor `@angular/*` (enforced by `check:boundaries`), and it is still **not** the privileged Device Agent execution boundary of the trust zones below: it executes no tools, files or shells on behalf of anyone and accepts only a closed, typed RPC table. What changed is that the Agent now reaches the configured Hub, and only the Hub, over pinned TLS and holds the device key.
- **Reset and recovery as core destructive actions.** Settings › This Device offers *Clear data* and *Reset this device* (and, for an incompatible store, a quarantine reset). They follow the Destructive-Action Contract even though no tool manifest declares them: the preview issues a single-use token that expires after 60 seconds and is bound to the requesting window and a digest of what was previewed; confirmation without a token, with another window's token, with a replayed or expired token, or after the data changed since the preview is refused; viewing or previewing never changes data. Their boundary specs run in the high-consequence gate.

### Device identity and secret references (Phase 31B)

- **Identity.** A device has a random UUIDv7 ID and a standalone environment ID. A salted hash of the Windows MachineGuid detects a copied store: the clone gets a new device ID, the old ID is kept as `cloned_from`, unsent outbox ops are rewritten and secrets are marked as needing re-entry, so a cloned profile cannot masquerade as the original device. The display name defaults to "Windows PC" and is never read from the hostname, so enrolling or exporting a device does not leak a machine name unless the user types one. Web installations get a per-browser installation ID. These identifiers are not authentication; the Hub will authenticate devices independently in 31C.
- **Secret references.** A secret is a `SecretRef` row (`secret:<uuidv7>`, purpose, owner, device scope) with the `safeStorage` ciphertext in a table deleted together with the reference. Purposes are a closed allowlist (`ai.llmApiKey` today). The renderer-facing IPC is `status`, `set` and `remove` only; `status` returns set/unset and a hint masked in main. **No channel returns a secret value, and none may be added**; only main decrypts, in-process, by purpose, and `main-security.spec.ts` asserts the absence of a `get`. If encryption or the store is unavailable, `set` fails instead of storing plaintext. The old `secure-store.json` was imported once with its ciphertext copied unchanged and retired. A cloned device's secrets require re-entry because their ciphertext is bound to the original OS user and machine.
- **Outbox and logs.** The standalone outbox carries entity payloads only for the explicit journaled list; it never contains secret values, history, journals, crash recovery or scratch inputs, and raw credentials remain forbidden in outboxes, logs and backup manifests.

Phase 22 adds dependency-boundary validation and conformance checks. Phase 23 adds destructive-action and sandbox regression suites plus security-sensitive release gates. Later plugin, automation, HTTP proxy, SSH/remote, and agentic phases inherit these boundaries rather than weakening them.

### As built in Phase 31C

Phase 31C (Milestones 628-648) delivered the Hub's owner identity, device identity, transport and baseline controls. Decisions are [PD-023 to PD-037](../history/DECISION_LOG.md#phase-31c-implementation-decisions). Not delivered at its close: trusted-CA, reverse-proxy and Internet/public modes and their verification (private-mode trust and reverse-proxy mode were delivered by Phase 31E, see [As built in Phase 31E](#as-built-in-phase-31e-trust-and-exposure); Internet/public readiness was delivered by 31F, see [As built in Phase 31F](#as-built-in-phase-31f-internet-readiness)), encrypted backup (delivered by 31G, see [As built in Phase 31G](#as-built-in-phase-31g-backup-restore-and-transfer)), passkeys/TOTP and external OAuth. Phase 31D (Milestones 649-661) added synchronized-record authorization: sync push, changes, snapshot and state use the device credential and `summary` and the environment clear use the owner session; the Hub re-checks every operation against `SYNC_POLICIES`, the entity's owner device for usage and the manifest-derived setting-key scope, never accepts a device-claimed environment, and audits counts and ids only, never payloads. The environment clear follows the [Destructive-Action Contract](#destructive-action-contract) with a Hub-side single-use confirmation. A revoked device is rejected at the credential check, and sync-time verification for Internet exposure shipped in 31F (below); the test-only `DUDE_HUB_TEST_*` Hub environment knobs shipped in 31D are compiled out of release builds (PD-068). The table below is the credential map the Hub enforces; every Hub route declares one.

| Credential | Held by | Lifetime | Extra checks |
|---|---|---|---|
| Setup token | Hub config file (ACL'd) and the user's one-time hand-off | Single use; also carries local owner-reset tokens | Persisted throttling |
| Owner cookie session (`__Host-`, HttpOnly, SameSite=Strict, Secure) | Browser (Hub web) | 12 h idle, 7 d absolute; hashed server-side; listable and revocable | CSRF token (HMAC-derived), Origin and Fetch-Metadata checks |
| Owner bearer session (`dob_`) | The Device Agent, in memory only | 30 min idle, 12 h absolute; bound to the device key | No CSRF (not a browser credential) |
| Device access token (`ddt_`) | The Device Agent | 15 min, hashed server-side; obtained by signing a single-use challenge with the Ed25519 key | A device credential alone never grants owner rights |
| Pairing code | Shown to the owner for one device | 10 minutes, single use, 5 attempts; minted by an owner session; delivered as `dude-pair:v1:<host>:<port>:<code>:<spki>` and QR | Per-IP throttle |

**Owner authentication, bootstrap and recovery.** There is one owner, with an Argon2id password (`crypto.argon2`) and ten single-use recovery codes stored as SHA-256 hashes. `POST /api/v1/bootstrap` requires the one-time setup token, which `dude-hub setup-token` reads over the local admin channel and can hand off to a user profile resolved from the `HKLM` `ProfileList` entry for a SID, ACL'd to that SID (UAC-elevated by the desktop wizard, with arguments passed through the environment). Bootstrap creates the environment, owner, credential and recovery codes in one transaction; there are no default credentials and no unprotected bootstrap. Recovery has three paths: (1) a recovery code; (2) an elevated `dude-hub owner reset` through the local admin channel, which issues a one-time reset token; (3) device-assisted recovery, accepted by the Hub only through a challenge-signed request from a device the owner marked recovery-trusted (off by default, set with a password re-check, revocable). Device-assisted recovery revokes every owner session, is audited and broadcasts `owner-recovered` over realtime. **The Windows Hello (`UserConsentVerifier`) or CredUI current-user check that precedes it is a client-side UI gate that the Hub cannot verify**; the Hub-side protections are the trust flag, throttling, audit and the realtime notice, so a compromised recovery-trusted desktop can still request recovery.

**Devices.** Each device generates an Ed25519 keypair, the private key wrapped with CurrentUser DPAPI by the `windows-sys` helper. Enrollment signs the Hub instance, pairing code, device ID and public key. A revoked key is permanent; rejoining requires re-pairing with a new key. A device may read and update itself, unenroll, and obtain a device-bound owner bearer session only by presenting the owner password. Registration grants no synchronization and no remote execution (PD-010 holds). Non-browser clients may POST without an `Origin` header only when no `Sec-Fetch-*` header is present.

**Transport and exposure.** The Hub serves HTTPS only, from the first endpoint, with an ECDSA P-256 certificate generated by `node:crypto` (self-signed in 31C; a local-CA leaf by default for new Hubs from 31E). The default bind is `127.0.0.1:47600` (private). LAN mode (`0.0.0.0` plus a Windows Firewall rule for the Private profile only) is set by the installer checkbox or an elevated `dude-hub network lan on|off`; container mode binds `0.0.0.0` and is meant to be published to loopback. Clients pin the SPKI: a raw TLS pin probe before any bytes are exchanged at enrollment, then pinned HTTPS (verified at `secureConnect` from Phase 31E, replacing the `checkServerIdentity` check). Rotation (`dude-hub tls rotate|status|activate`) stages the next certificate, announces its pin over hello and realtime, records per-device acknowledgements and activates only after every active device acknowledged, or with `--force`, which lists the devices that will need re-pairing. From Phase 31E new Hubs use a built-in local CA by default (the self-signed certificate described here is what existing Hubs keep until `tls ca init`), and imported certificates, configured names, reverse-proxy mode and the gated public mode exist; see [As built in Phase 31E](#as-built-in-phase-31e-trust-and-exposure). Public (Internet) exposure is released behind the elevated readiness gate of Phase 31F.

**Baseline controls.** Strict security headers with an API CSP and a single Hub-web CSP (inline `index.html` scripts hashed into `script-src`, no `'unsafe-inline'`), a Host allowlist against DNS rebinding, credential-typed Origin, Fetch-Metadata and CSRF checks for mutating requests, JSON-only bodies with limits and TypeBox validation, an in-memory rate limiter that counts only `/api` requests, persisted failure throttling with exponential backoff (password, recovery code, setup token; pairing and device challenges are throttled per IP only so a failure flood cannot lock every device out), and an append-only `audit_events` log with a closed event list and a sanitizer that rejects credential-like detail, retained for 365 days or 100,000 events. Credentials, tokens, recovery codes, keys and request payloads are never logged. The realtime socket authenticates before upgrade, requires a version-negotiated hello, enforces heartbeats, size and rate limits, and closes revoked sessions and devices with code 4003. The CLI never opens the database while the service runs; it uses a local admin named pipe or Unix socket.

**Service account and supply chain.** The service runs as the virtual account `NT SERVICE\DudeHub` with an ACL'd `%ProgramData%\DUDE\Hub`, not `LocalSystem`. WinSW 2.12.0 is sha256-pinned in the repository, but the hash was recorded from the official release on first download (trust-on-first-download). The Hub, Agent and installers are unsigned; SmartScreen and Smart App Control behavior is documented in [Windows setup](../WINDOWS_SETUP.md#binaries-are-unsigned).

### As built in Phase 31E (trust and exposure)

Phase 31E (Milestones 663-682) delivered private-mode access, trusted-certificate sources and the Hub web's browser credential model. Decisions are [PD-050 to PD-062](../history/DECISION_LOG.md#phase-31e-implementation-decisions) with amendments; evidence is in [Phase 31E acceptance](../delivery/PHASE31E_ACCEPTANCE.md).

**Exposure modes.** The `exposure` config block (strictly validated: mode, names, canonical origin) selects private (loopback, LAN, VPN, custom private names) or public. Public is released behind an elevated readiness gate (Phase 31F, Milestones 683–699) (PD-066). `dude-hub network mode public` runs only on the elevated admin pipe and only against a running Hub: the Hub builds its own diagnostics report as if public (the CLI adds the Windows firewall-rule inspection and the native-listener audit) and evaluates readiness. **Blockers:** the active certificate is not browser-trustable (it must be ACME-issued or imported, or the Hub must be in reverse-proxy mode; self-signed and local-CA certificates cannot be trusted by browsers and phones outside the network); no public DNS name is configured (IP addresses and local names do not count); the certificate does not cover the configured names or is expired or expires within 7 days; no owner exists; on a Windows service the Public firewall rule is missing, invalid or could not be inspected; an Agent TCP listener exists; the bind cannot accept inbound traffic (loopback without proxy mode); and external reachability has not been verified by an off-LAN client within 7 days (`--accept-unverified-reachability` downgrades only this item to a warning and is audited). **Warnings:** private-only or CGNAT addresses, DNS that does not resolve or does not point at this machine, and HSTS not active. With no blocker the operator must still type the exact phrase `EXPOSE HUB TO THE INTERNET` (`--type`); without it the command prints the readiness report and writes nothing. The audit event `network.exposure-mode-changed` records the mode, whether unverified reachability was accepted and the warning ids. At start the Hub refuses a public config only when the bind cannot accept inbound traffic; certificate state never blocks start, so an expired certificate is a diagnostics and alert matter, not an outage. Switching back to private is unrestricted. Names, certificates, proxy and mode changes are elevated admin-pipe actions; the Settings and diagnostics UIs are view-only with copyable commands, so a browser session cannot widen exposure.

**Certificate sources.** Operator-configured names (`tls names list|add|remove`) and non-link-local interface addresses in LAN or container mode feed the Host allowlist, the Origin allowlist and the certificate SANs. New Hubs create a built-in local root CA (ECDSA P-256, 10 years, `pathLen` 0, critical name constraints over private DNS suffixes, the host name, operator suffixes and private and loopback address ranges) and serve a 397-day leaf from it; existing Hubs opt in with `tls ca init` (which requires a running Hub). The CA key is DPAPI LocalMachine protected on Windows (a 0600 file elsewhere) and only the admin methods, the leaf issuer and the isolated renewal job may unprotect it (a spec enforces the import boundary). Renewal re-certifies the same leaf key 30 days before expiry, so pins do not change. `tls ca status|export` show and export the public root. `tls import` validates an operator certificate (key match, at least 7 days of validity, leaf only, serverAuth, SAN coverage of every configured name, chain linkage) and stages it through the dual-pin rotation; imported certificates are never renewed by the Hub. In proxy mode the public host is not added to the Hub's own certificate, and the local-CA leaf skips IP SANs outside the name constraints (a DNS name outside them is an error). Self-signed leaves omit `keyUsage`.

**Pinning.** Devices keep leaf-SPKI pinning and verify it at `secureConnect` (`connectPinned`: chain verification off, SPKI compared, only then is a verified socket handed to the HTTPS transport and the WebSocket), so no application byte reaches an unpinned peer and the result does not depend on the TLS library accepting the leaf as a trust anchor. Every certificate change goes through the dual-pin stage and activate rotation. Behind a reverse proxy the operator registers the proxy's leaf with `tls proxy-pin add|activate|remove|list` (two-step activate and remove); hello, the realtime welcome and the certificates route advertise `proxySpkiSha256`, and the Agent persists and acknowledges them.

**Reverse-proxy mode.** `network proxy on --trusted <cidr> --public-origin <url>` binds the Hub to loopback and trusts forwarded headers only from the configured peers, one hop. A single effective host drives the Host allowlist, the Origin check and the realtime cookie check; direct peers keep loopback access for the local desktop and pairing uses the public origin. HSTS is sent only with a browser-trustable certificate (local CA, imported or behind a proxy), never on a self-signed leaf.

**Rate limits.** A per-address flood guard covers every request; after authentication, per-session and per-device buckets apply (higher for web and change reads). Unauthenticated and credential routes stay per client address, which is `request.ip` and so comes from `X-Forwarded-For` only for a configured trusted proxy. Requests with a bad credential are metered only by the flood guard. Phase 31F adds the persisted flood guard and automatic IP block.

**Browser credentials.** The browser keeps the `__Host-` cookie session as its only credential. Its key-less browser device row (migration 0005) is attribution, never a credential: it cannot get a device token, enroll, be recovery-trusted or block pin rotation, and revoking it ends its bound sessions. The `/api/v1/web` routes accept the cookie session with CSRF and Origin checks only; bearer and device credentials get 401. Per-category web access (environment-level, defaults matching desktop consent) is enforced on every route, and usage writes are accepted only for the session's own browser row. Audit events carry counts and ids only.

**Hub web CSP and sandbox pages.** The page CSP gains `connect-src https: wss:`, `img-src https:` and `camera=(self)` and never `'unsafe-eval'`; inline `index.html` scripts stay hashed. The Hub serves `/sandbox/*` pages with each page's own CSP and `frame-ancestors 'self'`; the loader headers also apply to 304 revalidations, because a 304's headers merge into the cached response. Only `/assets/vendor/pyodide/*` is CORS-readable (for the opaque-origin Python frame). Sandbox iframes use `sandbox="allow-scripts"` and no `allow-same-origin`.

**Service worker and sign-out.** The Hub web service worker caches public assets only: no `dataGroups`, navigation excludes `/api` and `/sandbox`, so an authenticated response cannot enter the cache. Sign-out wipes every origin store (local and session storage including the installation id, every IndexedDB database) but not those public caches; session expiry only locks to sign-in. Browsers register the service worker only once the certificate is trusted.

**Diagnostics.** One engine reports exposure, the certificate (source, SANs against configured names, validity, pending pin acknowledgements, CA and renewal, HSTS), proxy pins, the Windows firewall rule and realtime health, plus 17 readiness checks (including the doctor-only public-firewall and native-ports checks) marked verified, claimed or not-checked, each with the exact elevated fix command. It reads public certificate fields only. External reachability is verified only when an off-LAN enrolled client reaches the Hub through a configured name (PD-065); it is a blocker for public mode unless explicitly accepted.

**Revocation at sync time (31F).** Every device-authenticated request re-resolves its `ddt_` token against the database (token, device not revoked or unenrolled, key not revoked), so a revocation is effective on the very next request even though tokens live 15 minutes; open realtime sockets close with 4003. Pushes also re-verify the acting device (or, for the browser, its live session and browser row) inside the commit transaction, so no write by a revoked actor can land even when revocation commits between authentication and commit; the response is the same 401 as for any bad credential. A revoked device that keeps trying (token, challenge, token redemption or realtime upgrade) is audited as `device.revoked-attempt` (denied, device id, address, route kind only, at most once per hour per device and kind) and listed in the security alerts, while every response stays identical to the unknown-credential case so the endpoint does not reveal which ids exist. Revocation still cannot erase data already cached on an offline lost device.

**Still not delivered.** Passkeys/TOTP remain Phase 81. External OAuth, as Google OIDC owner sign-in, is planned for Phase 32-SS1; see [Planned for SaveSphere](#planned-for-savesphere-phases-32-ss1-to-32-ss6). Encrypted backup was delivered by 31G; see [As built in Phase 31G](#as-built-in-phase-31g-backup-restore-and-transfer).

### As built in Phase 31F (Internet readiness)

Phase 31F (Milestones 683-699, decisions [PD-063-PD-068](../history/DECISION_LOG.md#phase-31f-implementation-decisions)) released public mode behind the elevated readiness gate and hardened the Hub for Internet exposure. Delivered controls, each described in the paragraphs above and below: the persisted flood guard with a temporary automatic IP block (`dude-hub security blocks list|clear`, migration 0006); owner step-up re-authentication and cookie session rotation (5 minutes, migration 0007); the `throttle.locked` audit event, optional client-address truncation and owner security alerts; built-in ACME (http-01, account key DPAPI-protected, renewal through the dual-pin rotation); dynamic-address and DNS-resolution diagnostics; the Public and ACME firewall rules and the native-listener audit; the Hub-observed external reachability echo; sync-time revoked-device verification; and test knobs compiled out of release builds. The gate itself is `evaluatePublicReadiness` behind `network mode public`. Not verified in this environment and recorded as owed in [Phase 31F acceptance](../delivery/PHASE31F_ACCEPTANCE.md): a real Let's Encrypt issuance, reachability from a phone on cellular, installed-service and elevated runs, and the first CI runs. Chain verification of an ACME certificate against public roots is not implemented, and TOTP/passkeys remain Phase 81.

### Public mode firewall (PD-068)

Public (Internet) mode needs an inbound path that the LAN rule does not give. Two named Windows Firewall rules exist for it, and both are managed **only** by the elevated CLI (`dude-hub network firewall public|acme on|off|status`, `tls acme issue --open-firewall`, `service uninstall`); the running Hub never changes the firewall and no owner-session route can.

- **`DUDE Hub (Public)`**: inbound allow, TCP, the Hub port, `program=<install dir>\dude-hub.exe`, `profile=any`, `remoteip=any`. `profile=any` is deliberate: a home router or a directly connected machine is usually classified Public, and a Private-only rule (the LAN rule) would silently block Internet clients. The program scope keeps the rule from opening the port for any other executable. `public on` refuses outside public mode unless `--force` is given.
- **`DUDE Hub (ACME http-01)`**: inbound allow on the ACME http port (`exposure.acme.httpPort`, default 80), same program, `profile=any`. It is meant to exist only while a certificate order runs: `dude-hub tls acme issue --open-firewall` adds it before the order and always removes it afterwards (also when the order fails), and reports if removal failed. The Hub binds that port only during an order, so the rule is never needed idle.
- **Never UPnP or NAT-PMP.** DUDE does not ask the router to open anything. The router port-forward to the Hub port (and, for ACME, port 80 during orders) is configured by the operator.
- **The Agent has no TCP port.** The Device Agent speaks over a named pipe and must never listen on TCP; no firewall rule ever names it, and the desktop app's optional LAN collaboration server is a deliberate, user-started exception. `dude-hub doctor` runs a native-listener audit (`netstat -ano`, `tasklist`) and the `native-ports-exposed` check fails on ANY `dude-agent.exe` TCP listener (loopback included), reports a non-loopback `DUDE.exe` listener as information and passes otherwise.
- **How it is checked.** `dude-hub doctor` (elevated, Windows) inspects the Public rule with `netsh ... show rule ... verbose`, validates port, program, profiles, direction, action, enabled state and remote address, and reports `public-firewall-rule`. `GET /api/v1/diagnostics` runs inside the service and never shells out, so it reports both checks as not-checked ("Run `dude-hub doctor` as administrator on the Hub machine"). `service uninstall` removes both rules; install leaves them absent; none of this applies off Windows.

### As built in Phase 31G (backup, restore and transfer)

Phase 31G (Milestones 700-719, decisions [PD-069-PD-074](../history/DECISION_LOG.md#phase-31g-implementation-decisions) with the amendments recorded there) added passphrase-encrypted Hub backups, an offline restore and manual authority transfer. Evidence and the owed passes are in [Phase 31G acceptance](../delivery/PHASE31G_ACCEPTANCE.md).

**Backup format and key handling.** A backup is one `.dudebackup` file written by the portable `@dude/hub-backup` package. Only a reader header is plaintext (magic, format and minimum-reader versions, KDF name and cost, salt, cipher, chunk size, stream id). The payload is XChaCha20-Poly1305 (`@noble/ciphers`) in 64 KiB chunks: the nonce is the stream id plus a chunk counter and the associated data is the SHA-256 of the header plus a final-chunk flag, so reordering, truncation, header tampering and a wrong passphrase all fail authentication. The manifest (Hub version, source instance id, authority epoch, schema version, `forTransfer`, per-file sizes and hashes) sits inside the encryption. The key is Argon2id (64 MiB, 3 passes, 1 lane) over the NFKC-normalized passphrase with a per-file salt; the library takes the KDF, random source and clock as injected ports and holds files as whole buffers under a 512 MiB plaintext and 32-file ceiling. A backup is verified (re-opened and hash-checked) before it is renamed into place, so a failed run leaves nothing.

**What is and is not in it.** The canonical database is copied with `VACUUM INTO` and scrubbed in the copy of sessions, device tokens, challenges, pairing codes, setup state and per-run meta; `hub.json` is included and the audit log travels inside the database. TLS certificates, the local CA key, the ACME account key and any DPAPI-protected material are never included: they are machine-bound and a restored Hub issues its own.

**Passphrase handling.** The passphrase is never stored, written to a file, accepted as a command-line flag, logged or audited. The CLI reads it from `DUDE_HUB_BACKUP_PASSPHRASE`, standard input or a no-echo prompt; it reaches the Hub over the owner-only admin pipe at apply time and is zeroed after use, and audit events carry file names, sizes, counts and short error codes only. Losing it makes a backup unrecoverable and every UI and CLI preview says so.

**Deliberate deviation: the scheduled-backup derived key.** To let unattended backups encrypt, `backup schedule set` stores a DPAPI-protected key *derived* from the passphrase (never the passphrase) beside the salt it was derived with, and every scheduled file reuses that key with a fresh stream id. It is as strong as DPAPI LocalMachine protection on the Hub machine, it is the one exception to "the secret is never stored", it is used only by the schedule methods and the scheduler, and a schedule can be set only from the elevated CLI (the owner UI is view-only). Retention deletes only files this Hub wrote under its own name pattern, never the newest, and not after a failed verification. (Superseded at 32-SS1 Milestone 847: the Hub keeps the backup v2 master key in its secret store instead, the derived key is deleted, and retention is the two-step `backup prune`; see [below](#as-built-in-32-ss1-backup-v2-engine-destinations-retention-and-restore-milestone-847).)

**Restore trust model.** A backup is trusted only after it authenticates under the operator's passphrase. Restore is an elevated, offline, two-step staged action (it refuses while a Hub runs on the directory; a non-empty directory needs `REPLACE HUB DATA`; a backup not made with `--for-transfer` needs `THE OLD HUB IS GONE`; typed phrases are compared exactly and a missing phrase refuses without spending the token). Existing data is moved to `backups/replaced-<stamp>/`, never deleted. The restored Hub gets a new instance id and `authority_epoch` = source + 1, clears transient state, `device_sync_state` and the TLS tables, keeps only the port and names in `hub.json` (private mode, loopback, no proxy, no ACME, no schedule, no `webRoot`), marks every non-revoked desktop device `needs_re_pair` and revokes its key, so a restored Hub never exposes itself to the Internet until the readiness gate passes again and no old device credential works against it. Owner credentials are restored: the owner signs in with the old password.

**Re-attach pairing codes.** `POST /pairing-codes` accepts `reattachDeviceId` (owner session with step-up) for a `needs_re_pair` desktop row. Only that device id can enroll with such a code; an ordinary code cannot take over the row (`active-conflict`); enrollment adds a new key and the old keys stay revoked. Browser rows are never marked: a browser simply signs in again.

**Fence.** `backup create --for-transfer` verifies the backup and then retires the Hub (`authority_state` = `transferred`). A retired Hub answers `GET /api/v1/hello`, which reports the state, and static assets only; every other request is 503 `hub-transferred` from the first `onRequest` hook (before the IP block, rate limit and authentication), and realtime sockets are closed with code 4004. `backup reactivate` (elevated, two-step) returns it to service at epoch + 1. Create, transfer, reactivate and restore each carry a consequence class (`filesystem-write`, `secret-management`, plus `system-config` for transfer and reactivate and `database-write` for restore), a confirmation-boundary spec in the high-consequence gate and closed-list `backup.*` audit events; no sync, web or restore path can mint a confirmation token. Devices and Hub web refuse a Hub whose instance or epoch does not match what they last saw (see the [data contract](DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31g-backup-restore-and-transfer)).

**Not delivered.** Automatic failover or election, streaming or compressed backups, a UI that sets or runs a backup, a recovery-key file, backup of certificates or the CA, and any second factor. Not verified in this environment and recorded as owed: restore and the DPAPI schedule key on an installed service with a real account, and a real second machine.

### As built in Phase 31J (collaboration, notifications and presence)

Phase 31J (complete; Milestones 787-815, decisions PD-099 to PD-115 in the [Phase 31J plan](../delivery/PHASE31J_PLAN.md), acceptance in [Phase 31J acceptance](../delivery/PHASE31J_ACCEPTANCE.md)) added a collaboration socket, a notification inbox with a per-device reader grant, presence and read-only job status. None of it adds a credential type, a remote-execution path or an owner right for a device. The data contract (document mapping, merge, retention) is in [Data and Synchronization](DATA_SYNC_ARCHITECTURE.md#as-built-in-phase-31j-collaborative-documents-and-realtime-depth).

**One WebSocket host.** `@fastify/websocket` is registered once for the whole Hub (`realtime/ws-host.ts`), because the plugin attaches to the server's single `upgrade` listener, and `/api/v1/realtime` and `/api/v1/collab` are declared in their own scopes on it. The shared transport ceiling is the largest collaboration frame (1 MiB); each route enforces its own smaller cap and closes with 4010 above it. Both routes authenticate in `ws-auth.ts` before the upgrade with the same credential classes (owner cookie session with a matching Origin, owner bearer session, device token); anything else is a plain 401 and never becomes a socket. `/api/v1/realtime` stays JSON-only and nudge-only: presence, `owner-view-changed {topic}` and `notification` events carry no record content, and no record payload is ever sent over it.

**`/api/v1/collab`.** A client must send a hello declaring protocol 3 or later (otherwise 4008); the welcome returns the Hub-assigned identity (registry row id, display name, a color slot from 0 to 7). JSON control frames are capped at 4 KiB and binary frames at 1 MiB (4010 above either), and a connection may send at most 600 frames per 10 seconds (4029) and subscribe to at most 8 documents, one channel each. The credential is re-checked at most once a second while frames flow and on every revocation event: an expired or invalidated credential closes with 4001, a revoked session or device with 4003, and a transferred Hub closes every collaboration socket with 4004. Heartbeat loss closes with 4009, and a socket whose outgoing queue grows past eight maximum frames is closed with 1013 rather than buffered. A subscription is refused or ended with a `doc-error` code: `consent-required`, `consent-revoked`, `not-found`, `forbidden` (a device outside this environment), `too-large` (an update that would push the materialized record past 128 KiB), `limit` and `unavailable`. Every code is produced by the socket suite, and a realtime contract-parity spec checks that every event matches its payload schema exactly and that 31J events are withheld below protocol 3.

**Consent, revocation and identity.** Subscribing to a persisted document requires the same consent as syncing it: a device's own reported category map with a completed first sync, an owner bearer's bound device, or the Hub web access toggle for a cookie session (the per-principal table is in the [data contract](DATA_SYNC_ARCHITECTURE.md#consent)). Only the owner's principals can subscribe, and a device credential never gains owner rights. When web access or a device's reported consent changes, the Hub rechecks every affected subscription and ends it with `consent-revoked`. The Hub rewrites the identity in every awareness update from the authenticated principal, so a client cannot claim to be another device; one subscription controls at most 8 awareness client ids, cannot overwrite another subscription's entries, and the Hub never publishes a presence of its own. Awareness and room state stay in Hub memory and are never persisted or audited.

**Rooms and kept documents.** Rooms are never persisted. The only way room content reaches storage is "Keep on Hub", which requires `collab-documents` consent for the caller, follows a client disclosure of destination, readers, retention and category, and is audited `collab.document-kept` with ids only (a refused keep is audited as denied). Deleting a kept document is audited `collab.document-deleted`. A history restore is audited `collab.history-restored` without content, after the current state is snapshotted, so nothing is lost. Room listing and creation, history listing and preview, and kept-document listing are not audited. Device callers (rooms, documents, history) always use the device token, never the owner bearer.

**Notification-reader grant.** `PUT /api/v1/devices/:deviceId/notifications-access` (owner session with step-up; desktop rows only, never a browser row; 409 for a revoked or unenrolled device) sets `devices.notifications_access` and is audited `device.notifications-access-changed`. A device token whose active desktop row holds the grant may call exactly `GET /api/v1/notifications`, `POST /notifications/read` and `POST /notifications/:id/dismiss` and receive `notification` events and the `notifications` view topic; every other owner route still refuses a device credential, and a device without the grant gets 403. The grant is checked at each delivery, so revoking it, the device or its enrollment stops delivery at once. The Agent uses the owner bearer when the owner is signed in on it, otherwise the device token, and maps a refusal to `notifications-unavailable`. OS notifications are opt-in per kind on the desktop (all off), held in device-local desktop preferences, and raised by Electron main.

**Notification content and retention.** Notifications come only from a closed producer list and kind list. A title is at most 120 characters and a body at most 300, and neither may hold a secret, a path, a stack or record content; the realtime event carries only id, kind, severity and title. Reading, marking read and dismissing are not audited, like marking security alerts seen. Dismissed notifications are deleted after 30 days, every notification after 90 days, and at most 500 are kept. The table is scrubbed from backups and cleared on restore.

**Presence and job status.** `GET /api/v1/presence` and `GET /api/v1/jobs` are owner-only reads (`no-store`, not audited). Activity sharing is opt-in per device, uses a closed vocabulary (registry tool ids, validated by the Hub, and shell destinations), is held in memory only and is never audited. Job status is read-only: there is no route or event that runs, queues or changes a job (privileged job execution stays in Phase 88), and each job's summary is short and credential-free. `job_last:*` meta is scrubbed from backups.

**Test-only knobs.** The 31J Hub e2e adds `DUDE_HUB_TEST_BACKUP_CHECK_MS`, `DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS` and `DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS`. Like the earlier knobs (PD-068) they are honored only by the test bundle; the release bundle ignores them (a gate spec checks this) and public mode refuses to start while one is set.

**New audit events.** `device.notifications-access-changed`, `collab.document-kept`, `collab.document-deleted` and `collab.history-restored`, all with ids and outcomes only.

### As built in 32-SS1 (managed Cloudflare Tunnel, Milestone 837)

The tunnel is built (decisions [PD-142](../delivery/PHASE32SS1_PLAN.md) and [PD-143](../delivery/PHASE32SS1_PLAN.md)). It is the existing reverse-proxy mode with exactly one trusted hop, the local `cloudflared` connector, and it widens exposure only through the elevated admin pipe. The rules below are enforced by specs (`tunnel-methods.confirmation-boundary.spec.ts`, `tunnel-edge.spec.ts`, `readiness-tunnel.spec.ts`, `host-guard-tunnel.spec.ts`, `tunnel-config.spec.ts`).

- **Configuration.** `hub.json` `exposure.tunnel: { enabled, hostname }` is strict. It is valid only together with `exposure.proxy` whose `trusted` list is `127.0.0.1` and `::1` and nothing else, and whose `publicOrigin` is `https://<hostname>`. The hostname is the owner's bare public domain (no port, no IP literal, no `www.`). The Hub binds loopback only and keeps serving HTTPS on loopback with its own certificate; no plain-HTTP listener exists. Backup restore drops the block along with the proxy (restored Hubs are private and loopback).
- **The loopback hop.** In the Cloudflare dashboard the tunnel's public hostname points at `HTTPS`, `https://127.0.0.1:<hub port>` with "No TLS Verify" on (the hop never leaves the machine and the Hub's certificate is private) and "HTTP Host Header" left empty, because the Hub needs the original public host name. The tunnel is remotely managed, so the Hub cannot set these; `dude-hub network tunnel on` prints them and `GET /api/v1/tunnel` returns them. Cloudflare's edge certificate is not pinned: devices verify the domain against the public CA chain (Milestones 838 and 839), and only the loopback hop is Hub-controlled.
- **Host and forwarding trust.** Fastify trusts one hop and only when the immediate peer is `127.0.0.1` or `::1`, so `request.ip` is the last `X-Forwarded-For` entry the connector or the edge appended, and a client-forged `X-Forwarded-For`, `X-Forwarded-Proto` or `X-Forwarded-Host` changes nothing: a forged forwarded host is refused with 421. In tunnel mode the Host guard serves exactly the bare domain, `www.<domain>` (with or without `:443`) and loopback names (the local desktop and admin); the OS host name, other configured names and interface addresses are not served through the tunnel, and a peer that is not the loopback connector is served loopback names only. `www.<domain>` from the connector answers `308` to `https://<domain>` with the same path and query, before rate-limited routes, authentication or any handler; the target is built from the configured origin and only an origin-form request target is appended.
- **Turning it on and off.** `dude-hub network tunnel on|off|status` goes through the admin methods `network.tunnel.preview|apply|status`. `on` is two steps: a preview that writes nothing and issues a single-use, 60-second confirmation bound to the hostname and the exposure configuration; then an apply that needs the exact phrase `EXPOSE HUB THROUGH CLOUDFLARE`, stores the connector token, starts the supervised connector, waits for it to connect, runs the readiness gate again and only then writes the configuration (a refusal stops a connector that call started and writes no configuration). It is tagged `system-config`, `process-management` and `secret-management`; `off` is tagged `system-config` and `process-management`, also needs a confirmation, stops the connector, removes the tunnel and its proxy block and returns a public mode that could no longer accept traffic to private. Both need the elevated terminal on a Windows service and a running Hub; no HTTP route, sync credential or web credential can issue or consume the confirmation, store the token or change exposure.
- **The connector token.** It is read from standard input (or a no-echo prompt), travels only in the `apply` call, is stored DPAPI-protected (purpose `tunnel.connectorToken`), reaches `cloudflared` only as `TUNNEL_TOKEN` in an allowlisted environment, and is never in argv, an audit row, a result, an error, a diagnostics report, the log tail (every line is redacted before it is stored) or a backup. A restored Hub reports the `tunnel` provisioning component as needing attention until the token is entered again.
- **Readiness.** When the tunnel is on, the gate replaces `public-firewall-rule`, `inbound-bind` and the `certificate-*` blockers with `tunnel-connector-ready` (running and answering `/ready`), `tunnel-hostname-matches-config`, `tunnel-trusted-hop-loopback-only`, `authentication-active` and `external-reachability` (the Hub's own observation through the public name; the first `on` needs `--accept-unverified-reachability`, because the public name cannot reach the Hub before the tunnel exists, and that choice is audited). A Device Agent listener still blocks. Direct Public mode, private mode and an operator's own reverse proxy are unchanged.
- **Disclosure.** Cloudflare terminates TLS at its edge and can read the traffic between clients and the Hub, and Cloudflare's own terms and limits (large non-HTML traffic, request sizes) apply; uploads are 8 MiB chunks. The text is the constant `HUB_TUNNEL_DISCLOSURE` in `@dude/contracts/hub`, shown verbatim in the CLI preview, `network tunnel status`, `GET /api/v1/tunnel` and the readiness warning `tunnel-edge-tls`; direct Public mode is the no-third-party alternative.
- **Audit and supervision.** `tunnel.enabled`, `tunnel.disabled`, `tunnel.token-set` (no value) and `tunnel.degraded` (a state and a short code, at most once a minute) are in the closed audit list. The Hub supervises the connector for its own lifetime: restart after 500, 2000 and 8000 ms, failed after the fourth crash within two minutes, stopped with the Hub. A Hub killed outright leaves the connector running until the next Hub start (or the service stop) removes it by pid file and image check.

### As built in 32-SS1 (Google sign-in, linking and unlinking, Milestone 842)

Google is the primary owner sign-in (decisions [PD-121 and PD-145](../delivery/PHASE32SS1_PLAN.md)); the Argon2id password and the recovery codes stay the fallback and can never be disabled. The relying party is the Milestone 841 core (code flow with PKCE S256, `state`, `nonce`, RS256-only ID tokens through `jose`, one egress allowlist); Milestone 842 adds the routes.

- **Identity is the provider `sub`, never an address.** A sign-in succeeds only for a `sub` the owner linked after an already-signed-in round trip. Any other Google account, including one with the same address, gets the same generic refusal (`/hub/sign-in?oidc=failed`), nothing says whether an owner, a link or an account exists, and it is audited as `oidc.refused-account` with a short hash tag of the `sub` and no address.
- **Failed callbacks cost like a wrong password.** Bad, unknown, replayed or expired `state`, a rejected code, any token failure and a refused account count toward the per-address `oidc` throttle (a lockout becomes `?oidc=locked` and a 423 on start) and toward the automatic IP block. The `oidc` counter has no global key, so nobody can lock the owner out of Google, and it is independent of the password counters. A provider outage, a missing client secret or an absent `oidc` block is `oidc-unavailable` (503) or `?oidc=unavailable`, is not counted, and never reaches password, recovery or step-up.
- **The callback is session-less and the cookie is `SameSite=Strict`.** The cross-site GET exemption (Milestone 841) strips every credential before the handler runs, so a session is never the authority for the callback. A successful sign-in creates the session through the password path's `createSession` (same cookie, lifetime, attribution and `owner.sign-in` audit with `via: 'google'`) and 302s to a sanitized same-site path; the landing page's same-origin requests carry the cookie. A Google session is NOT password-confirmed: Google is never a step-up factor, so it must step up with the password before pairing codes, recovery-code regeneration, revoke-all, linking or unlinking.
- **Linking is two legs bound to the signed-in owner.** `link/start` (cookie session, CSRF, step-up) binds the flow to the owner and the session. The cross-site, cookie-less callback only records the verified subject on the flow and hands back a one-time token (hash stored, 10 minutes); `link/complete` (cookie session, CSRF, step-up) spends it for the owner and the session that started the link (or one rotated from it), binding by `sub`. An already-linked `sub` is refused. Nothing is ever linked by an address match.
- **Unlinking follows the Destructive-Action Contract.** `unlink/preview` writes nothing and returns the consequence class (`secret-management`) and a single-use, 60-second ConfirmationStore token bound to the account; `unlink` needs step-up and the token. The last linked account cannot be unlinked (refused at the preview, and audited if a stale token reaches the apply). Boundary spec `server/oidc.confirmation-boundary.spec.ts` and, for the Hub-web panel, `google-accounts-panel.confirmation-boundary.spec.ts`, both in the high-consequence gate.
- **Audit and alerts.** `oidc.signin`, `oidc.signin-failed`, `oidc.refused-account`, `oidc.link-started`, `oidc.link`, `oidc.unlink` and `oidc.unreachable` (at most once a minute) are in the closed list; refused accounts, links and unlinks are security alerts. Nothing logs or audits a code, token, `state`, `nonce`, verifier, client secret or address. Owed: a real Google round trip in the acceptance script, because a fake provider cannot prove browser cookie behaviour across a cross-site navigation.

### As built in 32-SS1 (public-CA trust for the tunnel domain, Milestone 838)

Devices verify the Hub in one of two modes, recorded per enrollment (`hub_enrollment.trust_mode`, device-store migration 0006): `pinned` (the default and every pre-838 enrollment: leaf SPKI pin, chain verification off) and `public-ca` (PD-143: the Cloudflare edge's certificate is CA-issued and rotates, so there is no pin). Enforced by `apps/device-agent/src/hub/public-ca-trust.spec.ts`.

- **What `public-ca` verifies.** Node's own validation (`rejectUnauthorized: true`, default public root store, SNI and host-name check) for ONE stored domain, and the host must equal that domain BEFORE a socket opens: another host, an IP literal, a single-label or private-suffix name and a missing domain are refused (`DUDE_TRUST_ORIGIN_REFUSED`). Self-signed, expired, not-yet-valid, wrong-host and unknown-issuer certificates are refused with zero application bytes written. The stored origin must be `https:` on exactly that host without credentials or the connection manager refuses it (`trust-origin-refused`, state `untrusted-tls`). `pins`, `ca`, `allowSystemTrust` and announced pins are ignored in this mode, so nothing a Hub sends widens it; a public-CA enrollment never stages or stores Hub pins.
- **What `pinned` still does.** Exactly as before: a CA-valid certificate whose key is not pinned is refused.
- **No server-driven switching.** The Hub only ADVERTISES: `HelloResponse.trustMode`/`trustDomain` while the tunnel is on and a pin-free `dude-pair:v2:<domain>:<port>:<CODE>:public-ca` pairing string for the tunnel domain (`PairingCodeResponse.trustMode`/`trustDomain`); absent fields mean `pinned`, so older Hubs and clients are unchanged (older clients reject `v2` strings and fail closed). A differing advertisement becomes `AgentHubStatus.trustOffer`, information only. The only writers of the stored mode are a fresh enrollment and `hub.reconnect`, and a reconnect whose pairing string changes the mode or the public domain is refused (`trust-change-unconfirmed`, before any traffic) unless the request carries `trustChange: { mode, domain }` equal to the string's trust; the desktop shows it as an explicit checkbox naming the domain and that Cloudflare can read the traffic. Moving an online device needs the existing reconnect preconditions (it cannot happen while `online`).
- **Enrollment.** A `public-ca` pairing skips the pin probe, validates the chain on the first credential-free `hello`, requires that hello to advertise `public-ca` for exactly that domain, and only then presents the pairing code.
- **Test seam.** The one way a spec trusts a throwaway CA is `PinnedTarget.publicCaTestSeam` (`roots`, optional `dialAddress`), plumbed through `HubManagerDeps`/`EnrollDeps`; a spec scans the agent sources so only the wiring files mention it and none reads it from a hello, pairing payload or enrollment row. Production never sets it and verification is never disabled.
- **Limit.** The root store is Node's default (plus `NODE_EXTRA_CA_CERTS`, an operator setting), not the Windows certificate store.
- **Android (Milestone 839).** The Kotlin Hub client has the same two modes, selected from the stored enrollment only: `public-ca` uses the platform trust manager (system roots; no extra CA, no pins, no global trust-all) and OkHttp's host name verifier with the origin host forced equal to the stored domain, refuses http, other hosts, credentials and IP literals before a socket opens, ignores announced pins, and needs the owner's exact `trustChange` to move between modes or domains. Enforced by `PublicCaTrustTest.kt` (JVM) and `apps/mobile/src/hub/public-ca-trust.spec.ts`; the test seam is a constructor parameter nothing in `main` supplies.

### As built in 32-SS1 (route gating and the Hub-offline page, Milestone 844)

The whole-domain sign-in rule ([PD-122, PD-144](../delivery/PHASE32SS1_PLAN.md)) is enforced by a spec, not by convention. `apps/hub/src/server/route-gating.spec.ts` starts the real Hub with everything configured (a fake Google provider, a `savesphere.db`, an owner, ingest tokens) and again in tunnel mode without an owner, captures EVERY registered route through Fastify `onRoute` (the hook is installed before the first registration and the spec fails if the first routes are missing from the capture, WebSocket upgrades included) and probes each one anonymously with a schema-valid dummy body, so a route is never "gated" only because its input failed validation first. Every route outside the table below must answer 401 or 403, never a 2xx, a 5xx or a redirect, and must set no cookie. Each table entry is then probed to prove it behaves anonymously only as documented, and an entry with no registered route fails the spec (no stale entries). The table is the committed fixture `apps/hub/src/security/route-gating-allowlist.ts`, and the spec fails when the rows below diverge from it. The same spec presents the owner COOKIE cross-site (navigation, and a foreign `Origin` with a CSRF token) to every route, an ingest token to every non-ingest route, and a device token to a sample of owner-only routes, and requires a refusal.

| Route | Credential | Why it is anonymous |
| --- | --- | --- |
| `GET /api/v1/hello` | none | The trust and compatibility advertisement a client reads before it can sign in; no secrets, no owner data. |
| `GET /api/v1/tls/certificates` | none | The public certificate pins a client verifies before it trusts the Hub; never a key. |
| `POST /api/v1/bootstrap` | setup-token | First-owner setup by the single-use setup token; closed (409) once an owner exists. |
| `POST /api/v1/auth/sign-in` | none | Owner password sign-in, the way a session is created; throttled. |
| `POST /api/v1/auth/recover` | none | Recovery-code sign-in; throttled like sign-in. |
| `POST /api/v1/owner/reset` | none | Local owner reset by a single-use token minted on the Hub machine. |
| `GET /api/v1/auth/oidc/status` | none | Whether the sign-in page may offer Google (two booleans). |
| `POST /api/v1/auth/oidc/start` | none | Starts a Google sign-in flow; reveals nothing about any account. |
| `GET /api/v1/auth/oidc/callback` | none | The session-less OIDC callback; credential headers are stripped and it only redirects. |
| `POST /api/v1/devices/enroll` | none | A new device enrols with a pairing code and proof of key possession. |
| `POST /api/v1/auth/device/challenge` | none | A device asks for a fresh challenge to sign (an unknown id gets the same well-formed nonce). |
| `POST /api/v1/auth/device/token` | none | A device exchanges a signed challenge for a device token. |
| `* /api/v1/ingest/` | ingest-token | The token-only capture namespace (PD-119); a missing or wrong token is 401. |

Static assets are public by rule (GET and HEAD outside `/api`, including the SPA shell for any extension-less path), every other method outside `/api` is a 404, and an unknown API path is a JSON 404, never the shell. Not in the table, so gated: the device-recovery routes (device token) and the `/api/v1/realtime` and `/api/v1/collab` upgrades, whose authenticators run before the upgrade, so a missing credential is a plain 401 and never a socket. Adding a row is a security decision that needs a stated reason and a dated decision; widening the table to make the spec pass is not allowed.

**The Hub-offline page.** `apps/hub/web-static/offline.html` is a public, dependency-free page with no application data: it says the Hub is offline, shows the address bar's host name, offers Retry (a check of `hello`, then a reload), and says the desktop and Android apps keep working from their local copies while captures wait. It uses the browser's own system colors under `prefers-color-scheme` rather than design tokens, because the service worker serves it with no application CSS. The Hub serves it like any static file: no session, `Cache-Control: no-cache`, and a CSP that hashes its single inline script (no `unsafe-inline` for scripts). The Hub web build registers `hub-worker.js` (GitHub Pages keeps the stock `ngsw-worker.js`): the stock Angular worker, unchanged, plus one behavior. For a page navigation it lets the stock worker build its answer, probes `hello` (no credential, uncached), and answers with the pre-cached offline page only when the Hub is unreachable, times out after four seconds or answers 5xx (an ingress provider's 502, 503, 504 and 52x included); in every other case, and when the page is not cached, the stock answer stands. The stock worker pre-caches the page in the `app` asset group of `ngsw-config.hub.json`, and the worker never writes to a cache. The service worker still stores no authenticated response. A first-time visitor sees the ingress provider's error page (PD-123, accepted).

### As built in 32-SS1 (resumable uploads, Milestone 845)

| Method | Path | Credential | Notes |
| --- | --- | --- | --- |
| POST | `/api/v1/uploads` | owner cookie (CSRF) or owner bearer | Creates a session: declared size, optional whole-file SHA-256, sanitized display metadata; chunk size negotiated (8 MiB default, 1 to 32 MiB). |
| GET | `/api/v1/uploads/:id` | owner | Status and the received chunk ranges (the resume point). |
| PUT | `/api/v1/uploads/:id/chunks/:index` | owner | Raw `application/octet-stream`, `Content-Length` required, idempotent by index, optional `X-Chunk-Sha256`. The only non-JSON route; its own parser, JSON limits unchanged elsewhere. |
| POST | `/api/v1/uploads/:id/complete` | owner | Assembles into the blob store; 200 with the blob identity, or 202 while a long assembly runs; idempotent. |
| DELETE | `/api/v1/uploads/:id` | owner | Abort (one audited step). |

A device token is refused (403), an ingest token and an anonymous request are 401; none of these routes is in the anonymous allowlist. The session core takes a principal, not a credential, so 32-SS3 can add the ingest class without touching it.

- **Free-disk guard.** Session creation, every chunk and the completion are refused with HTTP 507 (`storage-full`) when taking the bytes would leave less than the larger of 512 MiB and 5% of the volume free. There is no fixed attachment size cap; the guard, a 1 TiB sanity ceiling per file, 8 open sessions per owner and a 2 TiB in-flight ceiling are the limits.
- **Abort and the Destructive-Action Contract.** Aborting an upload is deliberately a single authenticated, audited step (`upload.aborted`), not a preview and confirm pair. It removes only data the same credential created minutes or hours ago and nothing else references: the session's own staged chunk files and, once finished, the session's own blob reference. It cannot delete a committed blob (only the two-step mark-and-sweep collector can, and the grace period still applies), cannot touch a blob an item or attachment references (an attached session is left alone), is idempotent and is refused while the assembly runs. It is not a tool and has no `ConsequenceClass`; `uploads.spec.ts` asserts the blob-preservation boundary.
- **What a chunk can and cannot do.** A chunk body is streamed to a temp file and hashed, never buffered or parsed; the file name is `<index>.part` under a random session UUID (a client-supplied name or media type is sanitized display data and never part of a path); the declared size is bounded, an oversize body is refused from `Content-Length` before any byte is read, and a short or disconnected body leaves nothing behind. Audit events carry sizes and the blob hash, never a name or bytes.

### As built in 32-SS1 (backup v2 format, Milestone 846)

`@dude/hub-backup` gains the v2 format of [PD-150](../delivery/PHASE32SS1_PLAN.md): a streaming, encrypted repository of write-once objects plus a single-file export. The v1 code path (`sealBackup`, `openBackup`) is unchanged and still restores 31G files. The Hub engine that writes and restores it is [Milestone 847](#as-built-in-32-ss1-backup-v2-engine-destinations-retention-and-restore-milestone-847). The package stays portable: no Node built-ins; Argon2id, randomness and the clock are injected as in v1; the cipher is XChaCha20-Poly1305 (`@noble/ciphers`) and HKDF, HMAC and SHA-256 come from `@noble/hashes`.

**Key hierarchy.** A repository has a random 16-byte id and a random 32-byte master key. Its `repo` object holds the plaintext header (versions, `argon2id` cost and a per-repository random salt, a key-check value) followed by the master key wrapped with XChaCha20-Poly1305 under the passphrase-derived key. The wrap's associated data is the SHA-256 of the exact header bytes, so changing the versions, the KDF cost, the salt or the repository id fails exactly like a wrong passphrase (`wrong-passphrase-or-corrupt`). HKDF-SHA256 (salt = repository id) derives three independent subkeys from the master key: content (packs), manifest and dedupe. Every object then gets its own key, derived from its kind key and its object name. Changing the passphrase (`rewrapRepository`) re-wraps the master key under a fresh salt (and optionally new KDF cost) and replaces only `repo`. Every pack and manifest stays readable with the new passphrase, and the old passphrase stops working. An unattended schedule can open the repository with the master key itself (`{ masterKey }`, checked against the key-check value), so a passphrase change does not break it; the Hub keeps that key in its secret store (Milestone 847, below).

**Dedupe identity.** A blob's identity is HMAC-SHA256(dedupe key, raw SHA-256), in hex. The plain SHA-256 that restore needs for the content-addressed blob store exists only inside the encrypted manifest. So a destination, a standby or an index that sees identities cannot confirm that it holds a known file, and two repositories give the same blob different identities.

**Objects and chunks.** Every v2 object (`repo`, `packs/<32 hex>`, `manifests/<YYYYMMDDTHHMMSSZ>-<32 hex>`, and the export file) starts with the v1 magic `DUDEBKUP` and a JSON header carrying `formatVersion` 2 and `minReaderVersion` 2, so a v1 reader refuses any of them as `unsupported-version` before it derives a key. A pack or manifest header also names its kind, repository id, own id and chunk size. Then come `u32 length || ciphertext+tag` frames. Each holds exactly one chunk of plaintext (1 MiB by default, 1 KiB to 4 MiB); only the last data chunk may be short and none may be empty, so the offset of any byte is computable for ranged reads. The nonce is the object's 16-byte id plus a u64 chunk counter. The associated data is the SHA-256 of the header bytes, the counter and a final-chunk flag. The last frame is always a trailer, sealed with the final flag, holding the data-chunk count, the plaintext byte count and a SHA-256 chain over every data chunk's tag. Nonce uniqueness holds by construction: object ids are random, the writer refuses a repeated id, keys are bound to object names, and a sink must refuse to create a name that already exists (write-once).

**What tampering produces.** A wrong passphrase, or any change to the `repo` header, gives `wrong-passphrase-or-corrupt`. A future `minReaderVersion` in any header or in the manifest head gives `unsupported-version`, before any key is derived. An object cut off before its trailer, or inside a frame, gives `truncated`. Any flipped bit, reordered, duplicated, dropped or spliced chunk, data appended after the trailer, a pack or manifest substituted from another name or backup, or a missing pack gives `integrity`. `verify()` never reports partial success. The reader emits plaintext only after a chunk's tag verifies, but an entry's size and SHA-256 are checked at the end of its stream. A consumer must therefore stage what it reads and commit only after the stream completes. The specs flip every bit position of every object of a small backup (and of the header, index and tail of an export) and assert that verification fails each time.

**Manifest.** The manifest is a sealed object whose plaintext is NDJSON, at most 1 MiB per record:
- a `head` record (versions, backup and repository ids, creation time, Hub version, the 31G authority fields `hubInstanceId`, `authorityEpoch`, `schemaVersion` and `dbMinReaderVersion` as supplied by the caller, `forTransfer`, counts);
- `file` records (name, size, SHA-256, extents);
- `blob` records (dedupe identity, SHA-256, size, extents);
- `pack` records (the packs this backup created, with chunk and byte counts);
- one `end` record with totals.

An extent is `[packId, offset, length]` in that pack's plaintext. A blob may point into a pack of an earlier backup, which is how backups are incremental. The previous manifest is the dedupe index, so the format needs no separate `index` object; an engine-side cache is optional. The writer commits every pack first and the manifest last, so a manifest's existence is the commit point of a backup.

**Compatibility rule.** A reader ignores unknown fields and unknown record types. A writer may add one without raising `minReaderVersion` only when an older reader that skips it still restores correctly; otherwise it raises `minReaderVersion` in the head and in the object headers.

**Bounded memory.** The writer holds one chunk per open object (the current pack and the manifest). The reader holds one frame, one cached plaintext chunk and one manifest record. Neither depends on data size or entry count; the only sets that grow are the pack ids of one manifest (one per 64 MiB pack by default) and up to 4,096 file names. Structural ceilings: 2^24 entries per backup, 4,096 named files, entry names of up to 128 characters matching `[A-Za-z0-9][A-Za-z0-9._-]*`, 16,384 extents per entry (about 1 TiB at the default pack size), packs of at most 4 GiB (64 MiB by default) and fewer than 2^32 chunks per object. The 512 MiB and 32-file ceilings apply to v1 only.

**Single-file export.** `writeBackupExport` writes one `.dudebackup` v2 file: an export header (kind `export`, repository id, backup id), then the `repo` object, the manifest and every pack the manifest references, copied byte for byte, then a JSON index of their offsets and a 12-byte tail (u32 index length and `DUDEBKIX`). This is the file the 31G transfer flow moves. The export header and index have no key of their own, so the reader requires both to be canonical and contiguous and checks every field against authenticated data (the repository id, the backup id, and the versions in the manifest head); `verify` also requires the file to hold exactly the packs the manifest references. `openBackupFile` dispatches by header: a v1 file goes, whole and unchanged, to the v1 reader under its own ceiling, and a v2 export opens as a streaming reader.

### As built in 32-SS1 (backup v2 engine, destinations, retention and restore, Milestone 847)

The Hub writes and restores backup v2 ([PD-150](../delivery/PHASE32SS1_PLAN.md#2026-10-27-milestone-847-the-backup-v2-engine-local-destination-retention-and-restore)). Every rule of the 31G section above still holds unless restated here.

- **What a backup holds.** `dude.db` and `savesphere.db` as scrubbed `VACUUM INTO` copies (the 31G scrub list for `dude.db`, plus the `backup_dest*` meta keys; `SAVESPHERE_SCRUBBED_TABLES` and the `blob_lease:*` meta keys for `savesphere.db`; unreferenced `blobs` rows dropped), `hub.json`, and the bytes of every blob the snapshot references. Never the TLS directory, the CA or ACME keys, or the secret store (`config/secrets`, which now also holds the backup master key).
- **Consistency.** The run takes the `backup` blob lease first (GC is refused with `lease-held` while it is held), snapshots `dude.db`, then `savesphere.db`, and takes the blob set from that snapshot copy, never from a directory listing. The lease is renewed every minute and released at the end; a crashed holder's lease expires on its own.
- **The master key for unattended runs.** Every destination repository of a Hub wraps one random master key under the owner's passphrase (`createRepository(..., { masterKey })`; subkeys still differ per repository because they are salted by the repository id). The Hub keeps the unwrapped key in the secret store as purpose `backup.masterKey` (DPAPI LocalMachine with its own entropy on Windows; a mode-0600 file on Linux and Docker, file-permission protection only), created when the first destination is added with the passphrase. The passphrase itself is never stored. Only `backup/master-key.ts` imports the secret store for it (`secrets.spec.ts`); request handlers never see it; it is never logged, audited, returned or put in a message. The 31G derived schedule key is no longer used and is deleted by `backup schedule set|off`. A restore onto another machine opens a repository with the passphrase only.
- **Destinations.** `BackupDestination` (`backup/destinations/`): write-once `sink()` (a name that exists or is being written is refused; local: exclusive `.part`, fsync, then a hard link or a checked rename), `source()`, `list`, `stat`, `deleteObject` (prune and a run's own cleanup only), `replaceRepo` (atomic, re-wrap only), `probe` (connectivity and free space). Definitions (id, kind, label, folder) live in `hub.json` `backup.destinations` and are written only by the elevated `backup destination add|remove`; a credential of a later kind lives only in the secret store. A local folder inside the data, configuration, certificate, secret or storage directories is refused at add time and again whenever a definition is opened.
- **Verify on write.** After the manifest commit the run re-reads the new objects (`verify({ scope: 'new' })`) and fully reads a reservoir sample of up to four deduplicated blobs. A backup that fails is deleted again (manifest first, then its packs) and recorded as a failure (`verification-failed`), never as a success. Every object a run commits is listed in a journal (`dude.db` meta `backup_dest_journal:<id>`) until the run is recorded, so the next run or prune deletes what a killed run left.
- **Destructive actions.** `backup prune` (class `filesystem-write`), `backup rewrap` (`secret-management`, `filesystem-write`) and `backup destination remove` (`system-config`, plus `secret-management` when it is the last destination and so deletes the master key) are two-step admin-pipe actions with single-use 60-second ConfirmationStore tokens bound to the exact plan, the destination set or the definition. A prune never runs while a backup holds the destination (an in-process per-destination lock; the refused apply keeps its token), never deletes the newest backup, and sweeps a pack only when no retained manifest references it. Removing a destination never deletes its backups. Boundary spec `backup/backup-v2.confirmation-boundary.spec.ts` in the high-consequence gate. A backup run is additive and has no confirmation; it is elevated and audited.
- **Restore.** The offline restore reads a v1 file, a v2 single-file export or a v2 repository folder plus a backup id. It walks and authenticates the whole manifest before staging anything, streams every entry through its size and SHA-256 check into `data/.restore-tmp` (blobs into a staged content-addressed store), and swaps only after everything checked out. Under the same typed phrases it also moves `savesphere.db`, `storage/blobs` and `config/secrets` aside to `backups/replaced-<stamp>/`. A catalogued blob whose bytes the backup did not carry is marked `missing`.
- **Audit.** `backup.v2-created`, `backup.v2-failed`, `backup.v2-verified`, `backup.v2-pruned`, `backup.destination-added`, `backup.destination-removed` and `backup.rewrapped` carry destination ids, backup ids, counts, sizes and short codes only.
- **Status.** `GET /api/v1/backup/status` adds each destination's id, kind, label, last success, last backup id, last error code, last verification, repository size and next due time, the retention policy and the next scheduled run. It never returns a destination folder or a key.

### As built in 32-SS1 (restore drill and backup health, Milestone 850)

The monthly restore drill and the overdue, failed-backup and failed-drill notifications ([PD-150](../delivery/PHASE32SS1_PLAN.md#2026-10-29-milestone-850-the-restore-drill-and-the-backup-health-notifications)).

- **The drill never touches live data and needs no confirmation.** For each destination it restores the newest verified backup with the Hub's held master key (the same offline restore engine, under the 31G rules) into a fresh scratch Hub root under `backups/.tmp/restore-drill/`, checks both restored databases and the blob set, records the verdict and removes the scratch directory. The destination is only read (a read-only view whose writers throw), nothing outside the scratch directory is written, and the Hub root is never started. It is therefore not a destructive action under the [Destructive-Action Contract](#destructive-action-contract), which governs actions that change existing data: `dude-hub backup drill` is elevated and audited like `backup run`, with no token. The free-space guard, the sweep of crash-left scratch and the lock shared with backups, prunes and re-wraps are its resource limits.
- **Audit and notifications carry codes only.** `backup.drill-passed` and `backup.drill-failed` hold destination and backup ids, counts and a short closed code; a notification body echoes only the owner's destination label, a validated code and an age, never a path, folder or credential. No notification kind was added.

### Planned for SaveSphere (Phases 32-SS1 to 32-SS6)

Nothing in this section is implemented. It records the security contract that the SaveSphere program ([decisions PD-116–PD-140](../delivery/PHASE32SS_PLAN.md), [SaveSphere architecture](../savesphere/SAVESPHERE_ARCHITECTURE.md)) must meet. Until each item ships, the as-built sections above describe the Hub. Every rule above still applies: contract-first routes with a declared credential type, the closed audit list, step-up for owner-impacting changes, the readiness gate and the Destructive-Action Contract.

**Owner identity: Google OIDC primary, password fallback (32-SS1, PD-121).**
- **Flow.** The Hub runs the OIDC authorization-code flow with PKCE, a `state` and a `nonce`, against Google's discovery document, using an OAuth client the owner registers and supplies. The client secret is a Hub secret, never logged or backed up in plaintext. The ID token is verified for issuer, audience, expiry, nonce and signature against Google's published keys.
- **Binding.** A Google identity becomes an owner credential only after a signed-in owner completes a linking round-trip. It is bound by the stable subject (`sub`), never by email address alone.
- **Linked accounts.** Several of the owner's Google accounts may be linked. Linking and unlinking need step-up, the last linked account cannot be unlinked, and every sign-in attempt from an unlinked Google account is refused and audited (with the email hashed or truncated, never the raw token).
- **Session.** A Google sign-in produces the same `__Host-` owner cookie session as a password sign-in, so CSRF, Origin, rotation and expiry are unchanged.
- **Step-up and fallback.** Step-up stays the owner password (Milestone 842: Google is never a step-up factor, and a session a Google sign-in creates starts without a step-up; see [Google sign-in as built](#as-built-in-32-ss1-google-sign-in-linking-and-unlinking-milestone-842)). The Argon2id password, recovery codes, the setup-token bootstrap and every recovery path from 31C remain, so the Hub stays fully operable with Google unreachable or the client removed. That is the requirement under [Authentication and Identity](#authentication-and-identity).

**Whole-domain sign-in (32-SS1, PD-122, [PD-144](../delivery/PHASE32SS1_PLAN.md)).** On the owner's domain every page and API requires a session, the developer tools included. Static assets stay public so the sign-in page, service worker, offline shell and Hub-offline page can load; every API, websocket and admin route is gated except a documented allowlist (sign-in, recovery, the OIDC callback, `hello`, the token-only ingest path and, from 32-SS6, public share links), enforced by an enumerate-and-probe spec ([built in Milestone 844](#as-built-in-32-ss1-route-gating-and-the-hub-offline-page-milestone-844)), and the SPA `hubSessionGuard` keeps tool pages behind sign-in. Hub web caching rules are unchanged: the service worker stores no authenticated response.

**Managed Cloudflare Tunnel (32-SS1, PD-120).** As built at Milestone 837: see [As built in 32-SS1](#as-built-in-32-ss1-managed-cloudflare-tunnel-milestone-837); the rest of this entry is the original contract.
- **Process.** The Hub supervises `cloudflared` as a child process with a loopback-only origin connection. The tunnel is remotely managed: the owner pastes its connector token, which is a Hub secret (DPAPI, passed to the process in its environment, never on a command line), and ingress and `originRequest` settings live in the Cloudflare dashboard. The binary is version-pinned and hash-verified and runs with `--no-autoupdate` ([PD-142](../delivery/PHASE32SS1_PLAN.md)).
- **Mode.** The Hub runs in reverse-proxy mode, trusting only the loopback hop. Public exposure through the tunnel still passes the elevated readiness gate and its typed confirmation, and the reachability echo works through it as for any proxy. Two parts of the as-built gate don't fit a tunnel, and 32-SS1 resolves both ([PD-143](../delivery/PHASE32SS1_PLAN.md)):
  - the `public-firewall-rule` blocker applies even in proxy mode, but a tunnel needs no inbound port, so a tunnel-aware check set (the tunnel connected and healthy) replaces it and `inbound-bind` in tunnel mode;
  - Cloudflare manages and rotates its edge certificate, so DUDE does not pin it: devices (the Agent, the desktop and the Android client) verify the tunnel domain against the public CA chain, and only the loopback hop is pinned.

  See the [as-built constraints](../delivery/PHASE32SS_PLAN.md#as-built-constraints-the-phases-must-resolve).
- **Disclosure.** Cloudflare terminates TLS at its edge and can read traffic between clients and the Hub. Setup and Settings › Endpoint & Exposure state this, and direct Public mode is offered as the no-third-party alternative.
- **Unchanged limits.** No Agent port and no native service is ever published through the tunnel. The Hub still stores no DNS-provider credential and no Cloudflare API token (PD-064); the connector token cannot edit DNS, and the tunnel hostname's DNS routing is the owner's dashboard action.

**Ingest tokens and capture paths (32-SS1, 32-SS3, PD-119, PD-131).**
- **Token.** `/api/v1/ingest/…` accepts only scoped ingest tokens: random, hashed at rest, shown once, named, optionally expiring, with a last-used time, revocable, and minted with step-up. Cookies, bearer sessions and device tokens are refused there, and an ingest token is refused everywhere else.
- **Rights.** A capture-only token can create captures and nothing else. It can never read content, reach the vault or satisfy step-up.
- **Limits.** Ingest has its own rate limits and size caps. As built at Milestone 843 (the token-only scaffold, no capture route yet): a per-token bucket and a per-address failure bucket checked before any token is evaluated, failures counted toward the automatic IP block like failed logins, no cookie read or set and no CORS on the path, owner management under `/api/v1/admin/ingest-tokens` (step-up; revoke is two-step), the table scrubbed on restore so the owner reissues (PD-149). See [As built in 32-SS1 Milestone 843](../delivery/PHASE32SS1_PLAN.md).
- **Email.** Mail to `save@<domain>` is accepted only from allowlisted senders whose SPF/DKIM checks pass; rejected mail is counted, not stored.
- **Uploads.** Uploads are resumable and size-capped. Their type is detected from content (magic bytes), not from the name, and previews and parsers run in an isolated worker with time and memory limits.

**SSRF-safe fetching (32-SS3).** Link previews, metadata and "Archive original" fetches run on the Hub through one fetcher that:
- blocks loopback, private, link-local, CGNAT, unique-local, multicast and cloud-metadata addresses, including IPv6 and IPv4-mapped forms;
- pins the resolved address against DNS rebinding;
- re-checks every redirect;
- enforces size, time and content-type limits;
- never sends owner credentials or cookies.

**AI boundary (32-SS5, PD-134–PD-136).**
- **Disclosure.** Every AI task records and discloses which provider receives which content, and owner-configured spend caps apply.
- **Content as data.** Captured content reaches models only as delimited data, never as instructions. The Copilot and the organizer have no tools that fetch URLs, send messages, write outside their own proposal and revision path, or read the vault.
- **Limited writes.** AI writes are revisions authored by "AI" that the owner can undo. AI never deletes, merges or rewrites owner text, and it never changes a field the owner pinned.
- **Citations.** Citations are checked against the retrieved sources before they are shown.
- **Testing.** Prompt-injection tests are part of the gate.

**Vault (32-SS2, PD-138).**
- **Keys.** Vault content is encrypted at rest with its own data key, separate from the canonical database and the backup passphrase. Unlocking needs step-up, the unlock window is short, and the vault re-locks when idle.
- **Exclusions.** Vault items are excluded from full-text and vector indexes, AI, the Markdown mirror, ingest, sharing and export unless the owner explicitly includes an item.
- **Backups.** Backups carry vault content only as ciphertext.
- **What it is not.** It is not end-to-end encrypted (that remains Phase 82) and not a browser-autofill password manager.

**Guests and public links (32-SS6, PD-139).**
- **Guests.** A guest is a new principal kind: a Google identity the owner invites to specific notebooks or items with view, comment or edit access. Guests get their own cookie sessions and are authorized per grant on every route. They never reach the vault, AI settings, devices, sync, tools state, admin routes or the realtime owner topics, and they cannot invite anyone.
- **Public links.** Read-only, expiring, revocable, unguessable tokens scoped to one item or notebook, served without a session and rate-limited.
- **Audit.** Every grant, revocation, link and guest access is audited, and the owner stays the sole administrator.

**Markdown mirror and external editors (32-SS3, PD-133).**
- **Authorization.** Mirror writes are filesystem mutations under a standing authorization the owner grants per folder. They are made by the desktop's Phase 29 filesystem services in Electron main; the Device Agent performs no file operations, and moving the mirror there would need its own decision. The grant is previewed, revocable and carries a consequence class, as required by the [Destructive-Action Contract](#destructive-action-contract).
- **Writes.** The mirror writes only inside its folder, never follows links out of it, moves deletions to SaveSphere's trash rather than erasing files, and creates conflict copies instead of overwriting.
- **External editors.** Round-trip edits create new versions and never replace an original.

**Backup v2 (32-SS1, PD-124).**
- **Format.** Streaming, chunked backups replace the 512 MiB whole-buffer ceiling, include the blob store and stay passphrase-encrypted under the 31G format rules.
- **Destinations.** Credentials for offsite destinations (S3-compatible, Google Drive, OneDrive) are Hub secrets. A standby DUDE device pulls encrypted backup chunks over a device-token streaming route that only a device holding an owner-set, step-up, audited per-device grant can use ([PD-151](../delivery/PHASE32SS1_PLAN.md)).
- **Retention and verification.** Backups are verified when written; retention defaults to 7 daily, 4 weekly and 6 monthly, pruned only by a two-step confirm; a restore drill runs monthly and a backup is overdue at twice its interval ([PD-150](../delivery/PHASE32SS1_PLAN.md)). Creating and scheduling a backup stay on the elevated admin pipe; the Hub-web backup UI stays view-only.
- **Unchanged rules.** Restores keep the 31G trust model (new instance id, epoch + 1, devices re-pair).

**Audit additions (planned).** OIDC link, unlink, refused sign-in; tunnel configured or removed; ingest token minted or revoked; vault unlocked or locked; AI provider configured; mirror grant changed; guest grant and public link created or revoked; backup destination changed. Each event carries ids and outcomes only.

### Authentication and Identity

Authentication is essential for the self-hosted environment because the Hub may be reachable remotely. This identity is owned by the Hub and does not require a vendor account.

The Hub owns identity.

A personal installation may initially have one primary owner account.

Example:

The DUDE Environment contains the Owner and Registered Devices: Main Desktop, Second Desktop, Laptop, and Phone.

Authentication options may include:

- passkeys;
- WebAuthn;
- local Hub credentials;
- recovery codes;
- optional external OAuth in environments where the user chooses to enable it.

The core self-hosted system must not require Google/GitHub OAuth in order to function. From Phase 32-SS1, Google OIDC becomes the owner's primary sign-in ([PD-121](../delivery/PHASE32SS_PLAN.md)). The requirement still holds, because the password, recovery codes and setup-token bootstrap remain a complete path with Google unavailable.

#### Device registration is foundational

Device registration is not merely preparation for future remote execution.

It is required to distinguish:

```text
environment-level state
```

from:

```text
device-level state
```

Device records may contain:

```text
device ID
display name
platform
app version
last seen
capabilities
Hub eligibility
sync revision/cursor
revocation status
```

### Trust Boundaries

The architecture should formalize three trust zones.

#### Browser/mobile zone

Unprivileged remote clients.

They can access only authenticated Hub APIs/capabilities.

#### Hub zone

Authoritative coordination and persistence.

The Hub must not imply unlimited access to device-native resources.

#### Device Agent zone

Privileged local machine capabilities. (The resident Device Agent that owns the local Device State Store and the Hub connection is a per-user, unelevated process that executes no tools; it is not this zone. See [System Architecture](SYSTEM_ARCHITECTURE.md#device-state-store-service-vs-device-agent).)

The Agent must accept only explicit, validated, authorized operations.

A compromised web session must not automatically imply arbitrary:

- filesystem access;
- shell execution;
- registry access;
- process control.

### Authentication, exposure and execution gates

The first Hub implementation requires a self-contained owner bootstrap/authentication/recovery flow. Passkeys/WebAuthn, local credentials, recovery codes and optional external OAuth are candidate mechanisms; the initial combination, delivered in 31C, is an Argon2id password plus single-use recovery codes, a one-time setup-token bootstrap and no external OAuth ([PD-027](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-028](../history/DECISION_LOG.md#phase-31c-implementation-decisions), [PD-029](../history/DECISION_LOG.md#phase-31c-implementation-decisions)); passkeys/TOTP are deferred. The security baseline applies from the first endpoint ([PD-033](../history/DECISION_LOG.md#phase-31c-implementation-decisions)). Avoid unprotected public bootstrap, default reusable credentials and dependence on a third-party OAuth provider. The planned Google OIDC sign-in ([PD-121](../delivery/PHASE32SS_PLAN.md)) is an added primary method layered on this flow, not a replacement, so the Hub still never depends on Google.

Private exposure is the default, but a LAN or VPN is not a substitute for application authentication. Use secure session handling, origin validation, CSRF defenses where cookie authentication applies, session expiry, brute-force protection, rate limits, payload validation and audit from the first enabled endpoints; 31F verified readiness rather than retrofitting an unprotected Internet service.

A public Hub endpoint exposes only intended web/API/realtime services. Canonical SQLite, raw native IPC, Electron debugging interfaces, arbitrary shell endpoints and Device Agent ports remain private. An optional relay/tunnel requires explicit configuration and disclosure of its trust/data path; it is not needed for the direct user-owned deployment. Phase 32-SS1 plans a DUDE-managed Cloudflare Tunnel as the default ingress the setup wizard offers, with that disclosure, and keeps direct Public mode as the alternative ([PD-120](../delivery/PHASE32SS_PLAN.md), [Planned for SaveSphere](#planned-for-savesphere-phases-32-ss1-to-32-ss6)).

Audit enrollment/revocation, authentication/security failures, significant shared-state administration, backup/restore/transfer and future authorized jobs without logging credentials or tool payloads. Retention and operator inspection controls must be documented.

Existing mutation-core/sys-mutation protections remain mandatory. Sync and restore cannot issue confirmation tokens. Future remote writes must preserve preview, exact plan binding, expiry/replay protection, apply-time precondition checking, journaling and previewed undo/noUndo acknowledgement. Browser/mobile authentication alone cannot satisfy local confirmation or grant unrestricted machine access.

## Internet Accessibility Without External Hosting

The requirement is:

> DUDE must be reachable from the Internet while the application backend remains hosted on user-owned hardware.

This creates a networking requirement but does not require an external application host.

#### Direct self-hosting

Typical topology:

Internet traffic reaches the user’s public IP, passes through the router/firewall on HTTPS port 443, and reaches DUDE Hub.

A domain may point to the user's network:

`dude.example.com` resolves to the public IP; router/firewall policy directs HTTPS to the Hub.

#### Public addressing requirements

Direct hosting requires a routable Internet path.

Possible cases:

- public IPv4;
- static IPv4;
- dynamic public IPv4 plus DNS updates;
- publicly routable IPv6.

Residential CGNAT may prevent direct inbound IPv4 connections.

If the user is behind CGNAT, choices include:

1. obtain a public/static address from the ISP;
2. use properly secured public IPv6;
3. optionally use a relay/tunnel service.

Option 3 is **not** part of the strict no-external-hosting architecture and should remain optional. The tunnel relays traffic but does not host the application or its data. Phase 32-SS1 makes a DUDE-managed Cloudflare Tunnel the wizard's default because it also avoids port forwarding and CGNAT problems. It remains an owner choice with a disclosed trust path (Cloudflare can read traffic at its edge), and direct self-hosting stays fully supported ([PD-120](../delivery/PHASE32SS_PLAN.md)).

#### DNS is not application hosting

Using a domain registrar or DNS service does not mean the DUDE application is externally hosted.

DNS merely publishes where the user-owned Hub can be reached.

The Hub never updates DNS and stores no DNS provider credential (PD-064). The user's router or DDNS client owns address publication; the Hub only detects drift and explains it.

#### Dynamic addresses and DNS

- **Address inventory.** `src/diagnostics/addresses.ts` reads the machine's own interfaces and classifies each address (`private`, `cgnat`, `link-local`, `unique-local`, `public`; loopback is skipped). No external "what is my IP" service is ever contacted.
- **Drift record and alert.** The last-seen non-loopback, non-link-local address set is stored in `meta.hub_addresses`. At startup and every 5 minutes the Hub compares it with the live set; a change writes one `network.address-changed` audit event (`added` and `removed`, at most 16 entries each), appears in the owner security alerts, and prints an `addresses-changed` startup notice. The first run only records.
- **`address-stability` check** (verified): warns when the set changed since it was recorded, or when exposure mode is `public` and the machine has only private, CGNAT or unique-local addresses (a port forward or a public IPv6 address is required; CGNAT cannot accept inbound connections).
- **`dns-resolution` check** (the DNS answer is verified; reachability is never claimed): resolves the configured DNS names and the canonical origin host through the system resolver (3 s timeout, cached 60 s). Every answer on a local interface passes; answers not on any interface are informational (NAT, port forward, reverse proxy or stale DNS cannot be told apart from inside the machine); a name that does not resolve warns.
- **External reachability** (PD-065, Hub-observed). No third-party probe and no client trust: a client genuinely outside the network calls `GET /api/v1/reachability/echo` (owner session or device token) through the Hub's public name, and the Hub itself classifies the request's source address (`request.ip`: the socket peer, or the trusted-proxy client address in reverse-proxy mode) and Host. The request counts as verified only when the source is public and the Host is a configured name (in proxy mode, the proxy `publicOrigin` host). A private, CGNAT, link-local, unique-local or loopback source proves nothing and records nothing; the response says why. The source address is never returned or stored, only its scope. A verification stores `meta.reachability_last` (host, time, scope, `viaProxy`; last one only) and writes `network.reachability-verified` once per 24 hours. The `external-reachability` check passes for 7 days after a verification, then falls back to not-checked (a warning in public mode); `reachabilityVerified()` is the input for the public-mode readiness gate. A same-LAN request through the public name (hairpin NAT) arrives from a private address and is correctly not counted.

#### TLS is not application hosting

A public certificate authority such as Let's Encrypt may issue certificates for:

```text
https://dude.example.com
```

The application and data remain on the user's hardware.

Users who demand zero external service dependencies may use their own certificate authority, but browsers/devices would then need to trust that CA manually.

The architecture therefore distinguishes:

```text
No external application hosting
```

from:

```text
No external Internet services of any kind
```

The former is a core requirement.

The latter is possible but may reduce convenience/interoperability.

## Hub Accessibility Modes

DUDE should support at least two deliberate Hub exposure modes.

#### Private Hub

Default/security-oriented mode:

```text
DUDE Hub Accessibility

(*) Private
    LAN / private network / user-managed VPN only

( ) Public Internet
```

Only trusted/private-network devices can access the Hub.

A private endpoint may use an address such as `https://dude.internal`, resolved within the LAN or VPN and using a TLS certificate trusted by the connecting devices.

This is ideal for users who do not require arbitrary-browser access.

#### Internet Hub

Internet mode allows:

```text
https://dude.example.com
```

from remote browsers and mobile devices.

Internet mode should require or validate:

- HTTPS;
- authentication;
- secure cookies/tokens;
- firewall configuration;
- rate limiting;
- brute-force protections;
- origin controls;
- CSRF protections where applicable;
- session expiration;
- device revocation;
- security audit events;
- WebSocket authentication;
- no direct native-agent public endpoints.

A setup/diagnostic screen should report readiness:

```text
✓ Hub service running
✓ HTTPS configured
✓ external endpoint reachable
✓ authentication active
✓ firewall rules valid
✓ realtime endpoint available
```

## Optional VPN-Only Deployment

A security-focused deployment may expose only a VPN endpoint and keep DUDE inaccessible from the public Internet itself.

For example, a user-managed **WireGuard** VPN can provide access to the private Hub from authorized phones and laptops.

Example:

An authorized phone or laptop connects through the encrypted user-managed VPN to the user network, then reaches the private DUDE Hub.

This is an excellent private-access mode, but it changes the product promise from:

> accessible from any arbitrary browser on the Internet

to:

> accessible from authorized devices on the user's private network.

Both modes may be supported.

## Security Release Gates

Authentication, revocation, private-cache isolation, exposure readiness, mutation boundaries, backup/transfer and sync privacy require the evidence defined in [Distributed Release Verification Matrix](../delivery/QUALITY_AND_RELEASE.md#distributed-release-verification-matrix). [Security & Capability Disclosure](../SECURITY.md) remains generated from shipped manifests; it reports implementation and does not replace this architecture contract.
