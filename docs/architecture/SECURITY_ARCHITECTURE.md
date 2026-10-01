# DUDE Security Architecture

This specification owns trust boundaries and authorization. Device enrollment enables identity and synchronization; it does not authorize privileged remote execution. Existing native mutation protections remain mandatory throughout the distributed transition.

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
3. **Consequence tagging.** The tool's manifest declares the relevant `ConsequenceClass` (`src/app/shared/models/tool-definition.model.ts`) so it's covered by the generated High-Consequence Tool Matrix (`SECURITY.md`) and any capability-specific release gate.
4. **A confirmation-boundary test.** The tool's own spec asserts the destructive effect cannot fire without going through both steps above — this is the "Destructive-Action Harness" (Phase 23 Item 8) in practice: enforced per-tool at the point each such tool ships, not as a separate suite run against nothing.

Phase 27 applied the same shape to its non-local high-consequence checks. A `network-scanning` or `remote-write` run first gets a main-process preview. It then needs a single-use confirmation token, bound to the requesting window and the unchanged request, which expires after 60 seconds. `electron/network-bridge.spec.ts` covers that boundary, including an attempted renderer-side limit bypass. Phase 29's filesystem mutation engine is the first local implementation: it previews exact paths and preconditions, issues a 60-second single-use token bound to the requesting window and plan digest, rechecks files at apply time, journals per-operation results and supports previewed undo. Trash operations use the Recycle Bin. Engine and tool confirmation-boundary tests cover token replay, conflicts and the no-incidental-trigger rule.

Phase 31 adds the second local mutation engine, `sys-mutation`, for Windows system changes: processes, environment variables and PATH, registry values, services, scheduled tasks, startup entries, Windows features, software uninstall and ACLs. The token, digest and journal primitives were extracted from the filesystem engine into a shared `mutation-core` with no behavior change to Phase 29. Every change is a previewed plan of per-operation rows (target, before → after, elevation and conflict badges). Applying it needs a 60-second single-use token bound to the requesting window and the plan digest, and each operation re-checks its own precondition at apply time (process PID + creation time + image path, registry/env type + data hash, service state/config, task/startup enabled state, prior SDDL, feature state). A mismatch skips that operation as a conflict instead of overwriting. For critical processes and services (System, csrss, wininit, smss, lsass, services, winlogon, DUDE's own processes; critical services), the typed-name confirmation is enforced in main at `issueToken`, not only in the UI. Non-critical targets are warn-only by product choice. A plan that needs elevation is rejected at preview in a non-elevated session. Outcomes go to a journal, and reversible operations get previewed undo (itself a plan) from the System Changes route; kill, restart, uninstall, PowerShell and minidump operations are `noUndo` and need an explicit acknowledgment. Renderer-callable helper methods are a closed read-only allowlist, so a mutating helper method can only be reached through the engine. PowerShell execution (`powershell-builder`) uses the same confirmation primitives bound to the script's SHA-256, and never reruns from history. Each mutating route ships a colocated confirmation-boundary spec. The engine's new `ConsequenceClass` is `system-config`; the registry (`registry`) and process-management (`process-management`) classes are now in active use.

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

Phase 6's sandbox design (iframe isolation, network egress blocked via CSP, hard execution timeouts) is documented in `src/app/shared/code-sandbox/code-sandbox-doc.ts` and each Phase 6 tool's own sandbox file.

Phase 8 Stage 1 applies these standing rules to the Electron renderer (`contextIsolation` on, no `nodeIntegration`, all native access preload-mediated) and to the bundled local static server (`127.0.0.1` only, OS-assigned port). Stage 6's LAN collaboration server is the deliberate exception to loopback-only binding and is protected by session-code semantics documented in the Phase 8 record.

Phase 22 adds dependency-boundary validation and conformance checks. Phase 23 adds destructive-action and sandbox regression suites plus security-sensitive release gates. Later plugin, automation, HTTP proxy, SSH/remote, and agentic phases inherit these boundaries rather than weakening them.

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

The core self-hosted system must not require Google/GitHub OAuth in order to function.

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

Privileged local machine capabilities.

The Agent must accept only explicit, validated, authorized operations.

A compromised web session must not automatically imply arbitrary:

- filesystem access;
- shell execution;
- registry access;
- process control.

### Authentication, exposure and execution gates

The first Hub implementation requires a self-contained owner bootstrap/authentication/recovery flow. Passkeys/WebAuthn, local credentials, recovery codes and optional external OAuth are candidate mechanisms; select and document the initial combination in 31C. Avoid unprotected public bootstrap, default reusable credentials and dependence on a third-party OAuth provider.

Private exposure is the default, but a LAN or VPN is not a substitute for application authentication. Use secure session handling, origin validation, CSRF defenses where cookie authentication applies, session expiry, brute-force protection, rate limits, payload validation and audit from the first enabled endpoints; 31F verifies readiness rather than retrofits an unprotected Internet service.

A public Hub endpoint exposes only intended web/API/realtime services. Canonical SQLite, raw native IPC, Electron debugging interfaces, arbitrary shell endpoints and Device Agent ports remain private. An optional relay/tunnel requires explicit configuration and disclosure of its trust/data path; it is not needed for the direct user-owned deployment.

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

Option 3 is **not** part of the strict no-external-hosting architecture and should remain optional.

#### DNS is not application hosting

Using a domain registrar or DNS service does not mean the DUDE application is externally hosted.

DNS merely publishes where the user-owned Hub can be reached.

The Hub may optionally update dynamic DNS when the user's public IP changes.

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
