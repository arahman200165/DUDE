# Phase 32-SS1 implementation and acceptance evidence

**Status: implementation complete (Milestones 829–857, closed 2026-10-30); live passes owed.** The Hub platform for SaveSphere is built and its automated exit gate is recorded below. Every pass that needs a real Cloudflare tunnel, a real Google account, a real Windows service, a second machine, a phone or a browser is **owed**: none has been run, and none is claimed. As with 31E–31J, SS1 is declared complete with those passes owed ([PD-154](PHASE32SS1_PLAN.md)), and **32-SS2 is not gated on them**. The gate itself closed at Milestone 855. The Google Drive destination (Milestone 856) and the OneDrive destination (Milestone 857) were built after that record was closed (PD-150's cut line) and add the may-slip passes S19 and S20; both are built, neither has run against a real account, and either may slip to a named follow-up without reopening the gate ([PD-150](PHASE32SS1_PLAN.md)). Milestone 855 is documentation only: it ran no unit suite, and the consolidated final-gate row below is left for the commit that runs it.

The decisions are [PD-141–PD-154](PHASE32SS1_PLAN.md), the as-built record is the [SS1 as-built summary](PHASE32SS1_PLAN.md#ss1-as-built-summary), and the per-milestone deviations are in [Deviations and implementation notes](PHASE32SS1_PLAN.md#deviations-and-implementation-notes). The Hub still has one owner and one environment (PD-027).

## Implemented scope

| Milestone | Implementation |
|---|---|
| 829 | Decisions PD-141 to PD-154; program wording amended |
| 830 | Feasibility go/no-go: FTS5, `sqlite-vec` in the single-executable Hub, worker re-spawn (GO on all three) |
| 831–835 | Secret store; `savesphere.db` and the audit outbox; content-addressed blob store; durable job queue and isolated workers; provisioning engine and `GET /api/v1/provisioning` |
| 836–837 | Pinned `cloudflared`, the supervisor, managed tunnel mode and the tunnel-aware readiness gate |
| 838–840 | Public-CA trust for the Agent, desktop and Android; Android emulator acceptance on the sharded CI |
| 841–842 | OIDC core and Google sign-in, linking and unlinking |
| 843–845 | Ingest scaffold; route-gating probe and the Hub-offline page; resumable uploads |
| 846–848 | Backup v2 format; engine, local destination, retention and restore; S3-compatible destination |
| 849–850 | Warm-standby pull; restore drill and backup-health notifications |
| 851–853 | Power policy; Hub-web Platform status; desktop provisioning wizard |
| 854 | Exit suites: `70-platform`, the over-512 MiB run, MinIO, the extended Docker smoke |
| 855 | As-built documentation and this script |
| 856 | Google Drive destination (the narrow `drive.file` consent, resumable uploads, a fake Drive in the Hub vitest project; the real-Drive pass is S19, may slip) |
| 857 | OneDrive destination (the narrow `Files.ReadWrite.AppFolder` consent, staged resumable upload-session fragments, refresh-token rotation, a fake Graph in the Hub vitest project; the real-account pass is S20, may slip) and this amendment |

## Automated exit gate evidence

The gate is [PD-154](PHASE32SS1_PLAN.md)'s: a fake OIDC provider, a stub `cloudflared`, a generated backup larger than 512 MiB that streams with bounded memory and restores under the 31G rules, MinIO for S3, the route-gating probe, crash-injection suites, upload resume, duplicate, wrong-hash and disk-full cases, and fake-provider wrong `sub`, `nonce`, `aud` and `exp` cases.

### Recorded verification

Run on the Windows 11 development host. The first table is the periodic gate run right after the Milestone 853 commit (`f3065f10`, 2026-10-29); the second is what Milestone 854 recorded for its own suites (full detail in [its entry](PHASE32SS1_PLAN.md#2026-10-29-milestone-854-the-ss1-platform-exit-suites)).

| Gate | Result |
|---|---|
| `npm test` | Packages **716 files / 4,924 tests** passed. Angular **810 files / 8,795 tests** passed. |
| `npm run lint` | Passed: eslint, boundaries, design tokens **0 violations**, theme contrast **144 combinations / 49,008 checks**, inventories (**2,687** resolved sources, **78** component extractions, **334** registrations; **951** storage declarations classified). |
| `npm run test:electron` | **136 files / 1,549 tests** passed, 1 skipped. |
| `npm run test:hub` | **190 files** passed and 1 skipped; **2,079 tests** passed and 2 skipped. |
| `npm run test:high-consequence` | Passed (suites of 50 files / 187 tests, 8 / 71, 5 / 52, 16 / 125 and 1 / 6). |
| `check:dockerfiles`, `check:generated`, `check:desktop` | Passed (16 generator outputs fresh and repeatable). |

| Gate (Milestone 854) | Result |
|---|---|
| `e2e/hub/70-platform.spec.ts` | **8 of 8**, repeatedly; the whole `npm run test:e2e:hub` suite **390 tests** (389 passed on the first run, plus one stale 31J `60-collab` test fixed and re-run green). |
| `npm run test:hub:large` | **2 of 2**, about 60 s: a **591 MiB** backup and restore with resident-memory growth under 256 MiB (79 MiB repository backup, 71 MiB export). |
| `npm run test:backup-scale` | The v2 format at 600 MiB with deterministic memory counters (Milestone 846; about 47 s). |
| `s3-minio.spec.ts` (`npm run test:hub:s3`) | **5 of 5** against a real MinIO in Docker Desktop; skips without an endpoint. |
| Docker | The image built from `apps/hub/Dockerfile` and `scripts/docker-smoke-platform.mjs` (8 steps) against it. |
| `npm run hub:stage` | Passed, `vec0.dll` in the stage and its sums; the staged single-executable Hub provisioned by hand with `content-store`, `fts`, `vector` and `workers` `ready`. |

**Final consolidated gate: run 2026-10-30 at commit `c096d413` (Milestone 857, after the exit suites, acceptance script and the Google Drive and OneDrive destinations), every gate green on the first run with no fixes.** The Milestone 855 close-out itself was documentation only and ran none.

| Gate | Result |
|---|---|
| `npm test` | Packages **716 files / 4,928 tests** passed. Angular **810 files / 8,796 tests** passed. |
| `npm run lint` | Passed: eslint, boundaries, design tokens **0 violations**, theme contrast **144 combinations / 49,008 checks**, inventories (**2,687** resolved sources, **78** component extractions, **334** registrations; **954** storage declarations classified, 0 unreviewed). |
| `npm run test:hub` | **201 files** passed and 3 skipped; **2,245 tests** passed and 10 skipped. |
| `npm run test:electron` | **136 files / 1,549 tests** passed, 1 skipped. |
| `npm run test:high-consequence` | Passed (suites of 50 files / 187 tests, 8 / 71, 5 / 52, 18 / 143 and 1 / 6). |
| `npm run test:e2e:hub` | **390 of 390** passed (5.0 min). |
| `check:dockerfiles`, `check:generated`, `check:desktop` | Passed (16 generator outputs fresh and repeatable). |
| `node scripts/generate-security-doc.mjs` | Left `SECURITY.md` unchanged. |

### Exit gate status

The [roadmap exit gate](ROADMAP.md#phase-32-ss1): a fresh Windows install designated as Hub completes the wizard, the owner's domain serves the full DUDE web behind Google sign-in through the tunnel and, separately, through direct Public mode, the Hub stays usable with Google unreachable, and a backup larger than 512 MiB including blobs verifies and restores under the 31G authority rules.

| Requirement | Automated evidence | Owed live pass |
|---|---|---|
| Wizard and provisioning | Provisioning, wizard and session specs; `70-platform` test 2; `check:hub-service` provision step (CI, elevated Windows) | S1, S2 |
| Tunnel | Tunnel, readiness, host-guard and edge specs against the stub `cloudflared`; `70-platform` test 7 (forged `X-Forwarded-*`, `www`) | S3 |
| Public-CA trust | Agent and desktop specs; the Android `--tunnel-edge` instrumentation (API 29 and 36) | S4, S5 |
| Google sign-in and fallback | OIDC specs; `70-platform` test 6 (wrong `sub`, `nonce`, `aud`, `exp`, replay, token endpoint down, provider down across a restart) | S6, S7 |
| Direct Public mode | Readiness-gate specs (31F) | S8 |
| Gating | `route-gating.spec.ts` (every registered route, two Hub shapes); the Hub-offline page specs | S9 |
| Uploads | `uploads.spec.ts`; `70-platform` test 3 | S10 |
| Backup larger than 512 MiB, destinations, retention, drill | `backup-large.spec.ts`, `s3-minio.spec.ts`, restore-drill and retention specs, `70-platform` test 8; the Google Drive and OneDrive destination, methods, callback and confirmation-boundary specs against their fakes | S11, S12; S19, S20 for the real accounts |
| Standby | `server/standby.spec.ts`, `standby-puller.spec.ts` | S13 |
| Power policy | `power/*.spec.ts` against real and German `powercfg` output samples | S14 |
| Hub-web status | `hub-platform-*.spec.ts` | S15 |
| Docker subset | `docker-smoke-platform.mjs` | S16 |

## Guided manual acceptance script

For the owner. Run the groups in any order except where one names another. Each step is a command to copy or an action to take, followed by what you should see. Record the evidence fields in the **Result** line under each group and mark Pass or Fail. A Fail is a defect to fix and rerun, not a note; a skipped group stays **Pending** and carries forward.

**Blocking and may-slip.** *Blocking* means the pass is the evidence needed to tick the matching [32-SS1 Definition of Done](QUALITY_AND_RELEASE.md#savesphere-first-release-definition-of-done--all-planned) box and must pass before the owner relies on that capability for real SaveSphere data or before the 32-SS5 first-release gate. *May-slip* means it can carry to a named maintenance follow-up. Neither kind gates starting 32-SS2.

**Common setup.**

- The Hub machine: Windows 11, the Hub installed from the current `master` build (`npm run hub:stage`, then `npm run hub:installer`, then `DUDE-Hub-Setup.exe`), the owner created. All `dude-hub` commands run from an **elevated** PowerShell with `Set-Alias dude-hub "$env:ProgramFiles\DUDE Hub\dude-hub.exe"`. The data directory is `%ProgramData%\DUDE\Hub` (`config\hub.json` is the configuration).
- A domain you own on Cloudflare (called `notes.example.com` below, with a `www` record), a Google Cloud OAuth client of type Web application, a second Windows machine you own (NEW), one enrolled desktop, an Android phone and a browser on cellular data.
- No `DUDE_HUB_TEST_*` variable set on any Hub used here: the release bundle ignores them and public mode refuses to start while one is set.
- The backup passphrase is never stored; write it down. The Hub's data may be wiped between groups: use a throwaway environment.

### S1. Installed Hub: elevated provisioning, vector search, `check:hub-service` (blocking)

Sources: Milestones 830, 835, 836, 854.

1. `dude-hub provision status` (read-only, no elevation needed beyond a running Hub) on a freshly installed Hub. Expect overall `not-provisioned` and the command to run.
2. `dude-hub provision --json`. Expect exit 0 or 1 (1 is normal on the first run because the queue says "restart the Hub service" until it does). Then `dude-hub service restart` and `dude-hub provision status`: `content-store`, `fts`, `blob-store`, `queue` and `workers` `ready`, `cache` `ready`, `secrets` `ready`, and no secret value anywhere in the output.
3. `vector` should read `ready` (the pinned `vec0.dll` loaded from beside `dude-hub.exe`). If it reads `unavailable`, record the reason sentence: that is a Fail for this pass on Windows x64.
4. From the repository on any machine: `npm run hub:stage` and, in an **elevated** shell, `npm run check:hub-service -- --require`. Expect every step green, including the update step installing the staged `vec0.dll` by hash and the provision step asserting the worker re-spawn and the loaded vector library.
5. `dude-hub service stop` then start it again; with a tunnel on (S3), confirm `cloudflared.exe` ends with the service stop (`tasklist | findstr cloudflared` shows nothing). Kill the Hub outright (`taskkill /F /IM dude-hub.exe`), confirm `cloudflared.exe` may still run, then `dude-hub service start` and confirm the orphan sweep ends it and a single connector runs.

**Pass criterion:** statuses as above, `check:hub-service` passes elevated, and the connector never outlives a normal service stop. Record: Windows build, Hub version, the status JSON (redacted), `check:hub-service` output.

**Result: Pending.**

### S2. The desktop provisioning wizard, elevated (blocking; S2.3 may slip)

Sources: Milestone 853 (also 835, 837, 841, 851).

1. On the desktop enrolled to this Hub open Settings > Environment & Hub and press **Set up this Hub's platform**, then **Start**. Expect exactly one Windows administrator prompt for the whole session and the step list: Check and create storage, Cloudflare Tunnel, Google sign-in, Backups, Power, Standby copy, Finish.
2. Walk every step against the real services (S3, S6, S11, S13, S14 values). Confirm the tunnel step shows the dashboard values and makes you type `EXPOSE HUB THROUGH CLOUDFLARE` before it applies, the first run asks for the unverified-reachability checkbox, and the Backups step says the passphrase is not stored. In Task Manager > Details, add the Command line column and confirm no connector token, passphrase or client secret appears in any `dude-hub.exe` command line while the session runs (only `--session-pipe \\.\pipe\dude-hub-provision-...`).
3. Repeat as a **standard user** who approves the prompt with another administrator's credentials (the pipe is created by one account and used by the other). Expect it to work or fail with the wizard's own message; record which.
4. Leave the session idle 20 minutes and, separately, let the prompt sit 5 minutes unanswered. Expect the wizard to report the session ended and return to its start.
5. Press **Finish**: the Hub restarts once, the session ends, and the tunnel and Google sign-in are in effect.

**Pass criterion:** one prompt, every step applies or skips cleanly, no secret on any command line, a clean restart. Record: Windows build, user type, which steps ran, idle-time outcomes.

**Result: Pending.**

### S3. A real Cloudflare Tunnel (blocking)

Sources: Milestones 836, 837, 840. Do this with Google configured (S6) or first with the password only.

1. In Cloudflare Zero Trust > Networks > Tunnels create a remotely managed tunnel and copy its connector token. Add a public hostname for the **bare domain** `notes.example.com` with service type **HTTPS**, URL `https://127.0.0.1:<hub port>` (default `47600`), **No TLS Verify** on, and **HTTP Host Header** empty. Add DNS for `www.notes.example.com` to the same tunnel (a second public hostname with the same service values).
2. Preview: `dude-hub network tunnel on --hostname notes.example.com --accept-unverified-reachability`. Expect no change, the same dashboard values, the Cloudflare edge-TLS disclosure and a confirmation token valid 60 seconds. Compare the printed values with what you entered.
3. Apply, within 60 seconds, piping the connector token (never typing it as an argument): `Get-Clipboard | dude-hub network tunnel on --hostname notes.example.com --accept-unverified-reachability --confirm <token> --type "EXPOSE HUB THROUGH CLOUDFLARE" --token-stdin`. Expect the connector to start and become ready, the readiness gate to pass with the `tunnel-edge-tls` warning, the service to restart.
4. `dude-hub network tunnel status`: state `ready`, the token present (never printed), restarts 0.
5. From a phone on cellular data open `https://notes.example.com`: the sign-in page loads over a Cloudflare certificate. Sign in. In Settings > Endpoint & Exposure > Reachability press **Verify from this browser**: expect the Hub to record a verified public source (the real client address reaches the Hub through `X-Forwarded-For`, not loopback). Check Settings > Security & Sessions: the new session shows the phone's address kind, not loopback.
6. `https://www.notes.example.com/` must answer a 308 to `https://notes.example.com/`: `curl.exe -sI https://www.notes.example.com/` (expect `HTTP/... 308` and a `location: https://notes.example.com/`).
7. Forged header: `curl.exe -s -H "X-Forwarded-For: 203.0.113.9" https://notes.example.com/api/v1/hello` must behave like any request (the Hub's audit and rate limits must not show 203.0.113.9; check Settings > Security & Sessions or `dude-hub security blocks list`).
8. Stop the Hub service while the phone page is open and reload: Cloudflare answers an error; with the page cached from an earlier visit the Hub-offline page appears (S9).
9. `dude-hub network tunnel off` (preview), then with `--confirm <token>`, plus `--forget-token`; also delete the public hostname in the dashboard. Expect the connector to stop, the proxy block to be removed and the mode to return to private.

**Pass criterion:** the dashboard values from the Hub work exactly as printed, the Hub is reachable only through the tunnel (no inbound port, no firewall rule), `www` redirects, the real client address is observed, and the connector never outlives the service. Record: Cloudflare plan, the dashboard values used, the status JSON, the observed address kind, the `curl` output.

**Result: Pending.**

### S4. Public-CA trust on the desktop and the Agent (blocking)

Sources: Milestones 838, 837.

1. With the tunnel on, pair a desktop through the tunnel: in Hub web Settings > Devices create a pairing code **while browsing `https://notes.example.com`**; the string must be `dude-pair:v2:notes.example.com:<port>:<CODE>:public-ca`. In the desktop's Settings > Environment & Hub paste it. Expect the label "Public certificate authority (via Cloudflare - Cloudflare can read traffic)" and no SPKI pin shown.
2. Sync a setting both ways; open the realtime-dependent view (Hub jobs card live-updates) to prove the WebSocket upgrade through the tunnel.
3. Confirm refusal: pair with a pairing string whose domain differs from the Hub's tunnel domain and see it refused; add `127.0.0.1 notes.example.com` to `C:\Windows\System32\drivers\etc\hosts` temporarily on the desktop (pointing at a Hub on loopback with its own certificate) and confirm the desktop reports an untrusted certificate rather than connecting; remove the line.
4. Switching: on a device already paired by pin, use Reconnect with the new string and confirm the explicit "trust change" checkbox is required.
5. Behind a TLS-inspecting corporate proxy (if you have one): the connection should be refused until the proxy root is in Node's extra roots (`NODE_EXTRA_CA_CERTS`); record it.

**Pass criterion:** a desktop syncs and receives realtime events through the tunnel with public-CA trust and refuses any other host or chain. Record: Windows build, the string's trust, outcomes.

**Result: Pending.**

### S5. Android through the tunnel domain (may-slip)

Sources: Milestones 839, 840.

1. Emulator (API 29 and API 36), automated: in CI the shard-1 `--tunnel-edge` instrumentation is the evidence (S17). Locally, with an emulator and an unlocked-root image running, the scenario is `node scripts/mobile-instrument.mjs --tunnel-edge`.
2. Physical phone: install the current Android build, scan or paste the `public-ca` pairing string from S4.1. Expect "Public certificate authority (via Cloudflare ...)" on the connection screen, a successful pairing, a favorites sync and the realtime online display in Settings > Devices; forced offline and back works. Try the same app against a Hub URL whose certificate is not publicly trusted: refused as untrusted.

**Pass criterion:** the phone pairs and syncs through the real Cloudflare chain on its system roots. Record: device model, Android version, app version.

**Result: Pending.**

### S6. Google sign-in, linking and unlinking (blocking)

Sources: Milestones 841, 842, 853 (client secret entry).

1. In Google Cloud Console register the redirect URI `https://notes.example.com/api/v1/auth/oidc/callback`. In the wizard's Google step (S2) enter the client id and secret, or edit `%ProgramData%\DUDE\Hub\config\hub.json` to add `"oidc": { "clientId": "...", "redirectOrigin": "https://notes.example.com" }` and store the secret through the wizard; restart the Hub. `dude-hub provision status`: `oidc` `ready`.
2. Sign in with the password, open Settings > Security & Sessions > **Google accounts**, press **Link**, complete the step-up password prompt, choose the Google account on the real consent screen. Expect to return signed in with that account listed by its address.
3. Sign out and use **Continue with Google** from a cold browser (and from a phone). Expect an owner session; sensitive actions (create a pairing code) ask for the password step-up first: Google is never a step-up factor. Check the **cross-site cookie**: the landing page after the redirect must be signed in without a reload loop, in Chrome, Edge and Firefox.
4. With several Google accounts signed in to the browser, confirm `select_account` offers the chooser and picking an **unlinked** account lands on the generic "sign-in failed" message (`?oidc=failed`), never an owner session, and Settings > Security & Sessions shows an `oidc.refused-account` alert (a short hash tag, no address).
5. Link a second Google account. Unlink one (preview, then confirm): expect a two-step confirmation and one account remaining. Try to unlink the last one: refused.
6. Repeat the wrong-account attempt many times quickly from one non-loopback browser: expect the page to say sign-in is locked (`?oidc=locked`) and, after 25 failed credentials across kinds in 15 minutes, the address to be blocked (`dude-hub security blocks list`; clear with `dude-hub security blocks clear <address>`). Google sign-in locks per address only, so the owner is never locked out from elsewhere.
7. The password and the recovery-code path still sign in at all times ("Other ways to sign in").

**Pass criterion:** Google binds only after a signed-in round trip, an unlinked account is refused and audited, the last account cannot be unlinked, the password always works. Record: browsers, accounts used, audit entries seen.

**Result: Pending.**

### S7. Google unreachable (blocking)

Sources: Milestones 841, 842.

1. On the Hub machine add to `C:\Windows\System32\drivers\etc\hosts`: `0.0.0.0 accounts.google.com oauth2.googleapis.com www.googleapis.com`, then `ipconfig /flushdns` and `dude-hub service restart`.
2. Open the sign-in page. Expect the Google button still offered (only a click can find out) and, after the click, the password form with an explanation (`?oidc=unavailable`), never an error page or a 5xx. The password sign-in, step-up and recovery work. Confirm the Hub does not count these as failed sign-ins (no IP block).
3. Remove the hosts lines, `ipconfig /flushdns`, and confirm Google sign-in works again within the cached-discovery windows (a stale discovery document serves up to 24 hours while Google is down).
4. With the client secret removed (`dude-hub provision status` shows `oidc` needing attention), confirm the same graceful fallback.

**Pass criterion:** the Hub stays fully usable with Google unreachable through the password and recovery fallback. Record: what the page showed, timings.

**Result: Pending.**

### S8. Direct Public mode (blocking)

Sources: 31F plus Milestones 837 and 844 (readiness gate, gating).

1. Turn the tunnel off (S3.9). Follow [WINDOWS_SETUP: Exposing the Hub to the Internet](../WINDOWS_SETUP.md#exposing-the-hub-to-the-internet) with a public DNS name you control: `dude-hub tls names add <name>`, `dude-hub tls acme issue --name <name> --agree-tos --open-firewall`, `dude-hub tls activate`, `dude-hub network lan on`, `dude-hub network firewall public on --force`, port forwarding, then verify from a phone on cellular (Settings > Endpoint & Exposure > Reachability > Verify from this browser), then `dude-hub network mode public` (report only) and `dude-hub network mode public --type "EXPOSE HUB TO THE INTERNET"`, `dude-hub service restart`.
2. Run `dude-hub doctor`: no blockers; the tunnel-only checks are absent. The readiness report must list **no** `tunnel-*` blocker.
3. Through the public name: the sign-in page loads, the API is gated (S9), and Google sign-in works after the OIDC redirect origin is changed to the public origin (including its port) in the wizard's Google step or `hub.json`, with that redirect URI registered at Google.
4. `https://www.<name>/` does **not** redirect (the `www` redirect is tunnel-only); pair a desktop with the pinned `v1` string and confirm SPKI pinning still works.
5. `dude-hub network mode private` returns to private.

**Pass criterion:** the same web, sign-in and Google flows work through direct Public mode with the readiness gate passing, and the tunnel and direct modes never run at once. Record: DNS name, certificate source, doctor output.

**Result: Pending.**

### S9. Route gating and the Hub-offline page in a browser (route gating blocking; Firefox may-slip)

Sources: Milestone 844.

1. Anonymous probes against the live domain (any mode). Each must answer 401 or 403 with no cookie: `curl.exe -s -o NUL -w "%{http_code}\n" https://notes.example.com/api/v1/diagnostics`, `.../api/v1/provisioning`, `.../api/v1/tunnel`, `.../api/v1/queue`, `.../api/v1/backup/status`, `.../api/v1/standby/repositories`, `.../api/v1/ingest/ping`. The public ones answer 200: `/api/v1/hello`, `/` and `/offline.html`.
2. Open `https://notes.example.com/` in a private window: the sign-in page loads and no owner data or tool state is visible; navigate to a tool route directly and expect the sign-in redirect.
3. Offline page: sign in once in Chrome and Edge (so the service worker caches the shell), then `dude-hub service stop` and hard-reload. Expect "Your DUDE Hub is offline" with the last-known address and a Retry button; `dude-hub service start`, press Retry: the app loads. Through the tunnel with the Hub machine off, the Cloudflare error answer must also produce the offline page for a cached tab. Repeat once in Firefox (the wrapper proxies the `FetchEvent`).
4. The GitHub Pages companion still works anonymously: open the Pages site and use a tool with no Hub.

**Pass criterion:** nothing but the documented allowlist answers without a session, and a previously loaded tab shows the offline page instead of a browser error. Record: browsers, status codes.

**Result: Pending.**

### S10. A resumable upload over the tunnel (blocking)

Sources: Milestone 845. There is no upload UI until 32-SS3, so this drives the routes with `curl`. Run in Git Bash on a machine with `openssl`, `curl`, `split`, `jq` and `sha256sum`, with the tunnel (S3) on. The script was written from the route contract and was not run end to end by Milestone 855: if a step fails for a reason of the script itself, fix the script in this document in the commit that records the result.

```
H=https://notes.example.com
dd if=/dev/urandom of=big.bin bs=1M count=120          # 120 MiB, 15 chunks of 8 MiB
SUM=$(sha256sum big.bin | cut -d' ' -f1)
read -s -p "Owner password: " PW; echo
R=$(curl -sS -c jar.txt -H 'Content-Type: application/json' -d "{\"password\":\"$PW\"}" $H/api/v1/auth/sign-in)
CSRF=$(echo "$R" | jq -r .csrfToken)
HDR=(-b jar.txt -H "Origin: $H" -H "x-dude-csrf: $CSRF")
U=$(curl -sS "${HDR[@]}" -H 'Content-Type: application/json' -d "{\"size\":$(stat -c%s big.bin),\"sha256\":\"$SUM\",\"name\":\"big.bin\"}" $H/api/v1/uploads | jq -r .uploadId)
split -b 8388608 -d -a 3 big.bin chunk.
i=0; for f in chunk.*; do
  H1=$(sha256sum $f | cut -d' ' -f1)
  [ $i -eq 7 ] && { echo "interrupt here (Ctrl+C), then re-run the loop from the status check"; }
  curl -sS "${HDR[@]}" -X PUT -H 'Content-Type: application/octet-stream' -H "x-chunk-sha256: $H1" --data-binary @$f $H/api/v1/uploads/$U/chunks/$i | jq -c '{index,duplicate,receivedChunks}'
  i=$((i+1))
done
curl -sS "${HDR[@]}" $H/api/v1/uploads/$U | jq -c '{state,received}'
curl -sS "${HDR[@]}" -X POST $H/api/v1/uploads/$U/complete | jq -c '{state,sha256,blobRef}'
```

1. Run the loop, interrupt it part-way (Ctrl+C or unplug the network), then check the status and re-send only the missing indexes. An identical re-sent chunk answers `duplicate: true`.
2. Complete. Expect `state: complete`, the `sha256` equal to `$SUM` and `blobRef` of the form `upload:<id>`. On the Hub, the blob exists under `%ProgramData%\DUDE\Hub\storage\blobs\<aa>\<bb>\<sha256>` and `(Get-FileHash <that file>).Hash` equals the sum.
3. Expect no chunk to be refused by Cloudflare (8 MiB is below its request-body limit). If the tunnel answers 413 or a timeout on a slow link, record the chunk size and link speed; retry the chunk with a smaller `chunkSize` in the create request.
4. A wrong chunk hash (change one byte or the header) is refused; completing early answers 409; `Content-Length` above the chunk size answers 413 before the body is read.
5. Check the audit log: `upload.created`, `upload.completed` with ids and sizes only, no file name or bytes.
6. Repeat once with a file larger than the free-disk guard allows if you have a small volume (expect 507 `storage-full`, not a crash).

**Pass criterion:** a 120 MiB file survives an interruption and lands byte for byte through the tunnel. Record: the file size, link speed, chunk size used, the hashes.

**Result: Pending.**

### S11. Backups: local, S3, standby, drill, notifications, retention (blocking for one local and one real S3 provider; other providers and failure modes may slip)

Sources: Milestones 847, 848, 850, 854. The passphrase never goes on a command line.

1. Local destination on another drive: `dude-hub backup destination add --folder E:\DudeBackups --label "Second drive"` (asks for the passphrase twice). Then `dude-hub backup run`, `dude-hub backup destination list`, `dude-hub backup destination verify --id <id>`. Expect "verified" and the backup listed.
2. S3: set the passphrase in the environment for this shell (`$env:DUDE_HUB_BACKUP_PASSPHRASE = "<same passphrase>"`), then pipe the credentials (standard input is the credentials document): `'{"accessKeyId":"...","secretAccessKey":"..."}' | dude-hub backup destination add --kind s3 --endpoint https://<account>.r2.cloudflarestorage.com --region auto --bucket <bucket> --prefix dude-test --credentials-stdin --label "R2"` (use `--region <region>` and `https://s3.<region>.amazonaws.com` for AWS, `https://s3.<region>.backblazeb2.com` for B2). Then `dude-hub backup destination probe --id <id>`: expect `ok` and a conditional-write report of `enforced` (S3, R2, MinIO) or `unsupported` (B2). Clear the variable afterwards (`Remove-Item Env:DUDE_HUB_BACKUP_PASSPHRASE`).
3. MinIO: on the Hub machine itself repeat step 2 with `--endpoint http://127.0.0.1:9000 --force-path-style --allow-private-network`; for MinIO on another LAN machine use an `https` endpoint with a certificate the Hub machine trusts and the same flags (plain http is accepted only for a loopback host). Expect a metadata address such as `http://169.254.169.254` to be refused even with the flag.
4. `dude-hub backup run`: expect both destinations to complete, each verified on write. Upload a large file first (S10) so the packs are multipart; confirm a second `backup run` writes under a few MiB (deduplication).
5. Restore drill: `dude-hub backup drill`. Expect `passed` for each destination, no scratch folder left under `backups\.tmp\restore-drill`, and `backup status` showing the drill. For S3 note the egress cost (the drill reads every pack).
6. Schedule and notifications: `dude-hub backup schedule set --every-hours 1`, then make the local folder unwritable (`icacls E:\DudeBackups /deny "NT SERVICE\DudeHub:(OI)(CI)W"`) and wait about an hour: a **backup failed** notification reaches the bell (the text names a short code such as `EPERM`, never a path), restore access (`icacls E:\DudeBackups /remove:d "NT SERVICE\DudeHub"`) and confirm **recovered**. To see **overdue**, stop the service for more than twice the interval (2 hours at `--every-hours 1`) and restart.
7. Retention: `dude-hub backup run` three times in one day, then `dude-hub backup prune --destination <id>` (preview only). Expect it to list the older same-day backups as removable (the newest of each day, ISO week and month is kept) and the packs only they used; confirm with `--confirm <token>` within 60 seconds. Nothing is ever deleted without this second step.
8. Blob garbage collection: **no owner-reachable command exists** ([close-out limits](PHASE32SS1_PLAN.md#known-limits-and-gaps-recorded-at-close-out)); record that this step is not runnable and is covered by specs only.
9. A backup larger than 512 MiB including blobs on the real service: put at least 600 MiB of blobs in (S10 three times with 250 MiB files), `dude-hub backup run`, and watch the Hub process private bytes (`Get-Process dude-hub | % { [math]::Round($_.PrivateMemorySize64/1MB) }`) while it runs; expect no growth proportional to the data. Record time and disk used.
10. `dude-hub backup rewrap` (two steps) to a new passphrase; confirm both destinations still verify with the new one and the old one is refused.

**Pass criterion:** every destination backs up, verifies on write, drills green, retention deletes only after confirmation, and failures and recovery reach the bell with no path or credential. Record: provider, versions, timings, sizes, notification timestamps.

**Result: Pending.**

### S12. Restoring onto a second machine (blocking)

Sources: Milestones 847, 848, 854 and the [31G transfer drill](PHASE31G_ACCEPTANCE.md#transfer-drill-runbook). OLD is the Hub of S11; NEW is a second machine with `dude-hub` installed and its service stopped. Have the passphrase; do not copy secrets.

1. **From the local repository folder.** Copy `E:\DudeBackups\<destination folder>` (the folder holding `repo`, `packs`, `manifests`) to NEW. On NEW, elevated: `dude-hub service stop`, then `dude-hub backup restore --folder D:\Restore\repo` (preview, asks the passphrase, prints a token), then `dude-hub backup restore --folder D:\Restore\repo --confirm <token> --old-hub-gone "THE OLD HUB IS GONE"` (add `--replace "REPLACE HUB DATA"` if NEW's data directory is not empty). Expect every blob restored.
2. `dude-hub service start`, sign in with the **old owner password**. Expect: a **new** instance id and authority epoch + 1, every desktop marked **Needs re-pair**, public exposure off, no schedule, no destination, and `dude-hub provision status` reporting `needs-provisioning` with the machine-bound secrets (tunnel token, Google client secret, backup key, S3 credentials) needing re-entry.
3. Verify the data: the blob from S10 exists and its SHA-256 equals the original; sync records and Hub-web state are present; ingest tokens, Google links, notifications, jobs and standby grants did **not** carry over (reissue tokens; the Google link and client are configured again; sign in by password).
4. Re-run the wizard (or `dude-hub provision`), add a destination again (adding the old folder with the same passphrase continues its chain), and re-pair one desktop with a re-attach code (Settings > Devices > **Create re-pair code**, then Reconnect on the device); choose **Merge** in the first-sync preview.
5. **From the S3 bucket.** Copy the bucket prefix to a local folder keeping the layout (`aws s3 sync s3://<bucket>/dude-test D:\Restore\s3repo`, or `rclone copy`), then repeat step 1 with `--folder D:\Restore\s3repo`. Expect the same outcome. There is no `--bucket` restore source (Milestone 848).
6. **From a transfer export.** On OLD: `dude-hub backup create --for-transfer --folder E:\Transfer` (preview, then `--confirm`), carry the file and passphrase separately, restore on NEW with `dude-hub backup restore --file <path>` (no `--old-hub-gone` needed), and confirm OLD refuses sign-in with 503 `hub-transferred`.

**Pass criterion:** a backup of more than 512 MiB including blobs restores on a second machine under the 31G authority rules with every blob byte for byte, and the three sources behave alike. Record: machines, sizes, durations, epochs, hashes.

**Result: Pending.**

### S13. Warm standby pull and promotion (blocking)

Sources: Milestone 849 and [WINDOWS_SETUP](../WINDOWS_SETUP.md#keeping-a-warm-standby-on-a-paired-desktop).

1. On the Hub: `dude-hub standby list` (empty). Find the standby desktop's device id (wizard Standby step or `Settings > Devices`). `dude-hub standby grant <deviceId>` (preview), then with `--confirm <token>` within 60 seconds. `dude-hub standby list` shows it; an audit and a security alert `standby.granted` appear.
2. On the desktop choose a standby folder on another drive (wizard Standby step, **Choose standby folder**). Wait up to about two minutes for the first pull. Expect `<folder>\<destination id>\repo`, `packs\`, `manifests\` and no `.standby-partial` residue; only `local-folder` destinations mirror (not S3).
3. Interrupt a large pull (disconnect the network or kill the Agent) and let it resume: it continues from the partial. Remove the folder's drive and put it back: it recovers. With no grant (`dude-hub standby revoke <deviceId>` two steps) the device asks about once an hour and the audit shows `standby.denied`.
4. Prove ciphertext only: search the mirror for a known plaintext string from a note (`Select-String -Path "<folder>\*\packs\*" -Pattern "<string>" -SimpleMatch` finds nothing) and confirm no passphrase or key is anywhere in the folder.
5. Pull over three paths: LAN (pinned), the tunnel (public CA) and direct Public mode. The 4-open-stream cap (429) has no spec yet because it needs a stalled reader; exercising it live needs a device token and several slow readers and is optional.
6. **Promotion.** Take the old Hub away (power off, with its disk gone if possible). On a Windows machine with `dude-hub` (it can be the standby desktop): follow the promotion guide: `dude-hub service stop`, `dude-hub backup restore --folder "D:\Standby\<id>"`, then with `--confirm <token> --old-hub-gone "THE OLD HUB IS GONE"`. Sign in with the old owner password, re-pair devices, run `dude-hub provision`, add a destination, grant the standby again with a **new, empty** standby folder.
7. Run `dude-hub backup destination verify` or a drill against the standby folder added as a destination on the new Hub, since the standby never has the passphrase.

**Pass criterion:** the standby holds only ciphertext, resumes, loses access when the grant goes, and a Hub is rebuilt from it with the passphrase. Record: folder size, timings, the audit entries, the restored epoch.

**Result: Pending.**

### S14. Power policy: elevated change and regression notification (blocking)

Sources: Milestone 851.

1. `dude-hub power status` on English Windows (laptop and desktop if you have both): expect the AC sleep and hibernate timeouts and a verdict (`ok` or `needs-change`). Set the plan to sleep after 30 minutes (`powercfg /change standby-timeout-ac 30`) first if it reads `ok`.
2. `dude-hub power apply` (preview): the exact `powercfg` commands, the AC values before and after, the revert commands and a 60-second token. Then `dude-hub power apply --confirm <token>`. Expect success and `powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE` to show `0x00000000` for AC. **As the installed service**, this runs as `NT SERVICE\DudeHub`: record whether the service account may change the plan (if it fails with `powercfg-failed`, that is a Fail to fix, for example by running the Hub in an elevated foreground `dude-hub run`).
3. Regression: `powercfg /change standby-timeout-ac 30`, then `dude-hub service restart` or wait up to an hour. Expect exactly one **The Hub computer may go to sleep** notification (delivered under the "backup overdue" preference), a `power.regressed` audit row, the Power row in the Platform panel (S15) needing attention, and no repeat every hour; setting it back closes the episode.
4. `dude-hub power revert` (preview, then confirm): the recorded values return and no further reminders.
5. Repeat step 1 and 2 once on a **localized** Windows (a non-English display language), on a Modern Standby machine (where the hibernate or sleep setting may read `unknown`), and on a group-policy-managed machine (`not-verified` is the expected failure).

**Pass criterion:** the change is two-step, takes effect, is revertible, and a regression raises one notification. Record: Windows language and build, machine type, the printed commands.

**Result: Pending.**

### S15. The Hub-web Platform panel in a browser (may-slip)

Sources: Milestone 852.

1. Sign in to the Hub web, open Settings > Environment & Hub > **Platform** with the tunnel on, a failing destination (S11.6) and a sleeping computer (S14.3). Expect grouped rows (Setup, Storage, Queue and workers, Sign-in and access, This computer, Backups and standby), a chip with a glyph and text on each, one reason sentence and a copy button for each command. Press **Copy**: the clipboard holds the exact `dude-hub ...` command; deny clipboard permission and confirm it says so and leaves the text selectable.
2. Check Dark, Light, high contrast and each accent (Settings > Appearance): chips and text stay readable. Resize to the narrowest width (320 px, and browser zoom 200%): no horizontal scroll, commands wrap.
3. With NVDA on Windows 11: the summary and the copy confirmation are announced once in the polite live region; every control has a name; Refresh and copy work by keyboard only; the disclosure toggles.
4. Confirm it is view-only: no input, no link, and no command carries `--confirm`, `--type` or a typed phrase.

**Pass criterion:** correct states, readable in every theme, usable at the narrowest width and with a screen reader. Record: browser, NVDA version, themes checked.

**Result: Pending.**

### S16. Docker parity: storage, queue, upload and backup only (may-slip; CI runs it)

Sources: Milestone 854.

1. `npm run check:dockerfiles`, then `docker build -f apps/hub/Dockerfile -t dude-hub .` and `docker run -d --name hub -p 127.0.0.1:47600:47600 -v dude-hub-data:/data dude-hub`; bootstrap the owner as the CI step does, then `node scripts/docker-smoke-platform.mjs`. Expect all 8 steps to pass and, in the provisioning status, `vector`, `tunnel` and `power` `unavailable` ("not available in this deployment"), never `needs-attention`.
2. `docker restart hub`, and confirm the uploaded blob, the backup repository on the volume and the provisioning state survive.
3. Confirm `dude-hub provision status` and `dude-hub network tunnel status` inside the container report the tunnel, power policy and vector search as unavailable here rather than failing.

**Pass criterion:** the Docker image runs the subset of PD-141 and reports the rest as unavailable. Record: image id, Docker version.

**Result: Pending.**

### S17. First green CI runs of the new jobs (blocking: record the run)

Sources: Milestones 836, 840, 846, 848, 854. After the SS1 commits are pushed, on the `ci.yml` run for `master`:

`gh run list --workflow ci.yml --branch master --limit 5`, then `gh run view <run id> --json jobs --jq '.jobs[] | [.name, .conclusion] | @tsv'`.

Expect `success` for each of: `hub-s3` (MinIO as a service container, `DUDE_TEST_S3_REQUIRE=1`; if the pinned `bitnamilegacy/minio:2025.4.22` image has gone, the job fails loudly: replace the image), `backup-scale` (`test:backup-scale` and `test:hub:large`, within 30 minutes: record the duration), `docker-smoke` with the platform step, `hub-e2e` including `70-platform` on Linux, `hub-service` (windows-latest, elevated: the provision step and the `vec0.dll` update assertion), and the Android shards with `--tunnel-edge` on API 29 and API 36 (the `reactivecircus` emulator image must be rootable). A red job is a defect against Phase 32-SS1, fixed as maintenance.

**Result: Pending.**

### S18. Vector availability (blocking: part of S1; recorded here for the Docker and Windows matrix)

`npm run check:hub-capabilities -- --require-vector` on the staged Windows build must pass (FTS5, vector, worker re-spawn); the same command without `--require-vector` on the Alpine image reports vector `unavailable` and passes. Record both.

**Result: Pending.**

### S19. Google Drive destination (may-slip: Milestone 856; with S20 the last two SS1 passes, which may carry to a named follow-up)

Sources: Milestone 856. Needs a Google account and a Google Cloud project you own. The passphrase and the client secret never go on a command line. **May slip:** a blocking S11 needs one local and one real S3 provider only; this pass is the evidence for the Google Drive destination and carries to a named follow-up if it is not run before 32-SS2 relies on offsite backups.

1. In Google Cloud Console, in a project you own: enable the **Google Drive API**; configure the OAuth consent screen and **publish it to Production** (a client in Testing issues refresh tokens that expire after seven days, which the Hub reports as `reauth`; record whether you tried it); create an OAuth client of type **Web application** and add the authorized redirect URI `https://notes.example.com/api/v1/backup/drive/callback` (your Hub's public origin, the tunnel domain from S3). Note the client id and secret.
2. Step one, the preview (nothing is changed or contacted): `'{"clientSecret":"<secret>"}' | dude-hub backup destination add --kind drive --client-id <id> --redirect-origin https://notes.example.com --label "Google Drive" --credentials-stdin`. Expect a preview naming the scope `https://www.googleapis.com/auth/drive.file`, the redirect URI you registered, the consequence `secret-management, remote-write`, and a token on standard output. Confirm `dude-hub backup destination list` still shows no Drive destination.
3. Step two: set `$env:DUDE_HUB_BACKUP_PASSPHRASE = "<the same passphrase as the other destinations>"` and re-run the same command with `--confirm <token>` within 60 seconds. Expect a consent URL on standard error and "Waiting for your approval". Open it in a browser signed in to the Google account that should hold the backups. Expect Google to ask for access to **only** files the app creates ("See, edit, create and delete only the specific Google Drive files you use with this app"), never "all your Drive files". Approve. Expect the page "Google Drive authorized", the CLI to print "Authorization received" and then the new destination as JSON. In Google Drive expect one new folder `DUDE Hub backups` holding a file `repo`, and **nothing else changed** in your Drive. In `https://myaccount.google.com/permissions` expect the app listed with the narrow access.
4. Open the same consent URL again after it was used (or a second time in another tab): expect the page "Google Drive was not connected" (a replay), the Hub audit log to show no new row for it, and nothing added. Start a connect and press Cancel at Google: expect the CLI to exit with `declined`, nothing added, and an audit row `backup.drive-authorized` (failure, reason `declined`).
5. `dude-hub backup run`: expect Drive to complete and verify on write. A first backup larger than 8 MiB uploads in chunks: while it runs, disconnect the network for 30 seconds and reconnect (or throttle the link): expect the run to resume and finish, not restart. Then `dude-hub backup destination verify --id <id>`, `dude-hub backup destination probe --id <id>` (expect `authorized`, `folder`, `write`, `read`, `delete` all true and the storage used and limit of the account), `dude-hub backup drill` (expect `passed`; the drill downloads every pack, so note the time and the API quota used).
6. In the Drive web UI open `DUDE Hub backups`: expect files named `repo`, `packs/<32 hex>` and `manifests/<stamp>-<32 hex>`, each a binary with no readable content. Confirm the Hub never touched any other folder (the app can only see what it created).
7. Retention: run `dude-hub backup run` three times in one day, then `dude-hub backup prune --destination <id>` and confirm with `--confirm <token>`. Expect the older same-day manifests and unreferenced packs to be **permanently deleted** (not in the Drive trash) and the newest backup to verify.
8. Revocation: at `https://myaccount.google.com/permissions` remove the app. Run `dude-hub backup run`: expect the run for this destination to fail with the code `reauth` and a plain message, a **backup failed** notification in the Hub bell naming `reauth` (no token, no path), and `dude-hub backup destination list` showing the last error. Reconnect without a new destination or passphrase: `'{"clientSecret":"<secret>"}' | dude-hub backup destination add --kind drive --client-id <id> --redirect-origin https://notes.example.com --reconnect <id> --credentials-stdin` (two steps), then `dude-hub backup run`: expect success, the same folder, and a **recovered** notification.
9. A full Drive: fill the account's storage (or use an account near its limit) and run: expect the code `quota`, nothing half-written left in the folder (a failed run removes its own uncommitted objects), and the notification.
10. Second-machine restore: copy the folder's objects (`repo`, `packs/*`, `manifests/*`) to a local folder keeping those names (download them from Drive), then `dude-hub backup restore --folder <that folder>` on the second machine (S12). On the restored Hub expect the Drive destination to be listed but `unavailable` ("connect it again") and the provisioning status to flag the missing secret, until step 8's reconnect command is run with the same client; expect the reconnect to find the recorded folder only if the same Google account and OAuth client are used.
11. Disconnect: `dude-hub backup destination remove --id <id>`: expect the preview to name the classes `system-config, secret-management, remote-write` and that the backups are not deleted; confirm with `--confirm <token>`. Expect the app gone from `https://myaccount.google.com/permissions` (revoked) and the `DUDE Hub backups` folder and its files still in Drive. With the network down, repeat on a second connect: expect `revokedAtGoogle: false` and instructions to remove the app at the Google page.
12. Confirm the secrets stay secret: `Select-String -Path "$env:ProgramData\DUDE\Hub\config\hub.json" -Pattern "<secret>|1//"` finds nothing (only the client id and folder id are there); `%ProgramData%\DUDE\Hub\config\secrets\backup.drive.refreshToken.dpapi` exists and is not readable text; the Hub log and the audit view (Settings > Security) show no secret, token or consent URL.

**Pass criterion:** the consent asks only for `drive.file`; a replayed or declined callback changes nothing; a run uploads and resumes, verifies and drills; prune deletes only after confirmation; a revoked consent is reported as `reauth`, notified and recoverable by reconnect without losing the folder; a full Drive is reported as `quota`; disconnect revokes and never deletes the backups; no secret reaches `hub.json`, a log, the audit trail or the bell. Record: Google account type (personal or Workspace), consent screen status (Testing or Production), the redirect origin, timings and sizes, the chunk behaviour under a network drop, the Drive API quota used by a drill, and every notification timestamp.

**Result: Pending.**

### S20. OneDrive destination (may-slip: Milestone 857; the last SS1 milestone, and may carry to a named follow-up)

Sources: Milestone 857. Needs a **personal** Microsoft account (an outlook.com, hotmail.com or live.com address; OneDrive for Business has no app folder and is not supported) and an app registration you own. The passphrase and the client secret never go on a command line. **May slip:** a blocking S11 needs one local and one real S3 provider only; this pass is the evidence for the OneDrive destination and carries to a named follow-up if it is not run before 32-SS2 relies on offsite backups.

1. In the Microsoft Entra admin center (or the Azure portal, App registrations), in a tenant you own: **New registration**, supported account types **Personal Microsoft accounts only** (or "Accounts in any organizational directory and personal Microsoft accounts"), platform **Web** with the redirect URI `https://notes.example.com/api/v1/backup/onedrive/callback` (your Hub's public origin, the tunnel domain from S3). Under **API permissions** add the delegated Microsoft Graph permission `Files.ReadWrite.AppFolder` (it appears as "Have read and write access to a dedicated folder in your OneDrive") and nothing else. Under **Certificates & secrets** create a client secret and copy its **Value** now (it is shown once; the Hub needs the value, not the secret id). Note the **Application (client) ID**. Record the secret's expiry date.
2. Step one, the preview (nothing is changed or contacted): `'{"clientSecret":"<secret value>"}' | dude-hub backup destination add --kind onedrive --client-id <application id> --redirect-origin https://notes.example.com --label "OneDrive" --credentials-stdin`. Expect a preview naming the scope `Files.ReadWrite.AppFolder offline_access`, the redirect URI you registered, the consequence `secret-management, remote-write`, and a token on standard output. Confirm `dude-hub backup destination list` still shows no OneDrive destination.
3. Step two: set `$env:DUDE_HUB_BACKUP_PASSPHRASE = "<the same passphrase as the other destinations>"` and re-run the same command with `--confirm <token>` within 60 seconds. Expect a consent URL on standard error and "Waiting for your approval". Open it in a browser signed in to the Microsoft account that should hold the backups. Expect Microsoft to ask for access to **only** the app's own folder ("Access your app folder" or "Have read and write access to a dedicated folder in your OneDrive") and to maintain that access ("Maintain access to data you have given it access to"), never "all your files". Approve. Expect the page "OneDrive authorized", the CLI to print "Authorization received" and then the new destination as JSON. In OneDrive expect, under **Apps**, a folder named after your app registration holding a folder `DUDE Hub backups` with a file `repo`, and **nothing else changed** in your OneDrive. At `https://account.microsoft.com/privacy/app-access` expect the app listed. If Microsoft shows a consent for `Files.ReadWrite.All` or any permission beyond the two above, record it: the Hub must have refused it (a failed connect with the reason `scope-refused`).
4. Open the same consent URL again after it was used (or a second time in another tab): expect the page "OneDrive was not connected" (a replay), the Hub audit log to show no new row for it, and nothing added. Start a connect and press Cancel at Microsoft: expect the CLI to exit with `declined`, nothing added, and an audit row `backup.onedrive-authorized` (failure, reason `declined`). Record whether the real redirect carried a `session_state` parameter (the Hub allows it and ignores it).
5. `dude-hub backup run`: expect OneDrive to complete and verify on write. A first backup larger than 10 MiB uploads in fragments, staged under `<backups>\.tmp\onedrive` (expect that folder to be empty again afterwards): while it runs, disconnect the network for 30 seconds and reconnect (or throttle the link): expect the run to resume and finish, not restart. Then `dude-hub backup destination verify --id <id>`, `dude-hub backup destination probe --id <id>` (expect `authorized`, `folder`, `write`, `read`, `delete` all true and the used and total storage of the account), `dude-hub backup drill` (expect `passed`; the drill downloads every pack, so note the time, and any 429 or `Retry-After` the Hub waited out). Record the real host names of the upload and download addresses (the Hub log is free of them; use the failure code if a run ends `bad-endpoint`, which means Microsoft used a host the Hub's allowlist does not name, and send that host as a defect).
6. Token rotation: after the first run, note that `backup destination list` shows `credentialsStored: true`. Run `dude-hub backup run` on three different days (or restart the service between runs and set the clock forward only if you can): expect every run to succeed, with no `reauth`, proving the rotated refresh token is stored and used. Confirm the secret file `%ProgramData%\DUDE\Hub\config\secrets\backup.onedrive.refreshToken.dpapi` changes its timestamp after a run.
7. In the OneDrive web UI open the app folder, then `DUDE Hub backups`: expect files named `repo`, and folders `packs` and `manifests` holding `<32 hex>` and `<stamp>-<32 hex>` files, each a binary with no readable content. Confirm the Hub never touched any other folder.
8. Retention: run `dude-hub backup run` three times in one day, then `dude-hub backup prune --destination <id>` and confirm with `--confirm <token>`. Expect the older same-day manifests and unreferenced packs to disappear from the folder (they are in the OneDrive **recycle bin**, which still counts against the quota until emptied: record the quota before and after, and empty the bin) and the newest backup to verify.
9. Revocation: at `https://account.microsoft.com/privacy/app-access` remove the app. Run `dude-hub backup run`: expect the run for this destination to fail with the code `reauth` and a plain message, a **backup failed** notification in the Hub bell naming `reauth` (no token, no path), and `dude-hub backup destination list` showing the last error. Reconnect without a new destination or passphrase: `'{"clientSecret":"<secret value>"}' | dude-hub backup destination add --kind onedrive --client-id <application id> --redirect-origin https://notes.example.com --reconnect <id> --credentials-stdin` (two steps), then `dude-hub backup run`: expect success, the same folder, and a **recovered** notification. Also note what happens when the client secret expires (the secret's expiry date from step 1): expect `auth` (a refused client), not a silent success.
10. A full OneDrive: fill the account's storage (or use an account near its limit; the free plan is 5 GB) and run: expect the code `quota`, nothing half-written left in the folder (a failed run removes its own uncommitted objects), and the notification.
11. Second-machine restore: copy the files below `DUDE Hub backups` (`repo`, `packs/*`, `manifests/*`) to a local folder keeping those names (download the folder), then `dude-hub backup restore --folder <that folder>` on the second machine (S12). On the restored Hub expect the OneDrive destination to be listed but `unavailable` ("connect it again") and the provisioning status to flag the missing secret, until step 9's reconnect command is run with the same app registration; expect the reconnect to find the recorded folder only if the same Microsoft account and app registration are used.
12. Disconnect: `dude-hub backup destination remove --id <id>`: expect the preview to name the classes `system-config, secret-management` (no `remote-write`: nothing at Microsoft is called), that the backups are not deleted, and that you remove the app's access at `https://account.microsoft.com/privacy/app-access`; confirm with `--confirm <token>`. Expect no `revokedAtGoogle` or any revocation field in the answer, the app **still listed** at that Microsoft page until you remove it yourself (Microsoft has no revocation call; record this), the stored authorization file gone, and the `DUDE Hub backups` folder and its files still in OneDrive.
13. Confirm the secrets stay secret: `Select-String -Path "$env:ProgramData\DUDE\Hub\config\hub.json" -Pattern "<secret value>|M\.C"` finds nothing (only the client id and the folder id are there); `%ProgramData%\DUDE\Hub\config\secrets\backup.onedrive.refreshToken.dpapi` exists and is not readable text; the Hub log and the audit view (Settings > Security) show no secret, token or consent URL.

**Pass criterion:** the consent asks only for the app folder (and offline access); a replayed or declined callback changes nothing; a run stages, uploads in fragments, resumes, verifies and drills; the rotated refresh token keeps every later run working; prune deletes only after confirmation; a revoked consent is reported as `reauth`, notified and recoverable by reconnect without losing the folder; a full OneDrive is reported as `quota`; disconnect deletes the stored authorization and never the backups (and says plainly that Microsoft's side is removed by the owner); no secret reaches `hub.json`, a log, the audit trail or the bell. Record: the Microsoft account type and plan, the app registration's supported account types, the redirect origin, timings and sizes, the fragment behaviour under a network drop, the real upload and download host names, any throttling seen, the quota before and after prune and after emptying the recycle bin, and every notification timestamp.

**Result: Pending.**

## Owed items collected from the milestone entries

Nothing is dropped: each owed item of each [plan entry](PHASE32SS1_PLAN.md#deviations-and-implementation-notes) is listed with its source and the pass or follow-up that carries it. "Done later" means a later milestone resolved it (cited).

| Source | Owed item | Carried by |
|---|---|---|
| 830 | The staged Hub shipping `vec0.dll` | Done in 854; live check S1, S18 |
| 834 | Heap ceiling (`NODE_OPTIONS`) inside a built SEA; no production worker kind to prove SEA execution of a job beyond the 830 `ping` | S1.2 (workers `ready` in the SEA); a real worker kind is later work |
| 835 | A real Windows service pass: elevated `provision`, the worker probe inside the SEA, `vec0.dll` beside the executable; Docker covered by the Linux fallback only | S1, S16 |
| 836 | A real `cloudflared.exe` against a Cloudflare tunnel; the installed-service orphan sweep after a killed Hub; `hub:stage` and `check:hub-service` in the elevated CI job | S3, S1.4-S1.5, S17 |
| 837 | A real tunnel on a real Windows service: dashboard values, `www` through the real edge, reachability verification after the restart, an elevated `tunnel on` with the phrase, the service stop killing the connector tree, the edge's `X-Forwarded-For` reaching the Hub | S3 |
| 837 | No Hub-web Settings control and no `tunnel.degraded` notification | Done in 852 (status) and 853 (wizard); notification stays a limit |
| 838 | A real Cloudflare edge from a real desktop: the chain against Node's roots, ALPN, the WebSocket upgrade; a TLS-inspecting corporate root; `untrusted-tls` terminal until reconnect or restart | S4.2, S4.5 |
| 839 | The emulator pass through a real tunnel domain; `androidTest` instrumented tests were not run | Run locally in 840; S5, S17 |
| 840 | Real Cloudflare against API 29 and 36 system roots, ALPN `h2`; a UI pairing journey; the GitHub Actions emulator run | S5, S17 |
| 841, 842 | A real Google round trip: consent, `select_account`, the cross-site redirect and the callback `Set-Cookie`, several signed-in accounts | S6 |
| 841, 842 | The wizard step entering the client secret; the Hub-web status showing `oidc`; a restore drops links and the block | Done in 853, 852; restore behavior S12.3 |
| 844 | A browser pass of the Hub-offline page; Chrome and Firefox behaviour of the wrapped `FetchEvent` | S9.3 |
| 845 | A real browser upload through the tunnel (request timeout, 100 MB limit, slow link, early 413 seen from `fetch`); a multi-gigabyte run on a real volume | S10, S11.9 |
| 846 | The 600 MiB run in CI; JavaScript cipher throughput | Done in 854; first green run S17 |
| 847 | A real Windows service pass: the DPAPI master key under the service account, a scheduled run, a restore from the folder and from an export on a second machine; a destination on a network volume without hard links (checked-rename fallback on a real SMB share); a `rewrap` failing part-way | S11, S12; SMB share and part-way rewrap are may-slip follow-ups |
| 848 | Real providers (AWS S3, R2, B2, MinIO on a LAN): probe, run, verify, drill, the `If-None-Match` behaviour, a restricted key, a versioned bucket; the restore from a bucket; drill egress cost | S11.2-S11.5, S12.5 |
| 849 | A real two-machine pull over LAN, the tunnel and direct Public; an interrupted multi-GiB pull; a removed drive; the 4-stream cap's 429; the promotion guide run for real; Windows sleep or hibernate during a long pull; a spec for the 429 cap | S13 |
| 849 | A Devices-view standby grant indicator and a renderer UI for the puller | Wizard step done in 853; the Devices-view indicator remains owed (needs an owner read route, a security decision) |
| 850 | A drill on a real service with a multi-GiB repository and on S3 over a real network; the Settings status showing drill fields | S11.5, S11.9 (done in 852 for the status) |
| 851 | A real elevated `power apply` then `revert` as the installed service and as a foreground process, on English and localized Windows, laptop and desktop, Modern Standby and a group-policy machine; whether `NT SERVICE\DudeHub` may change the plan | S14 |
| 852 | A browser pass: Light, Dark, high contrast, each accent, narrowest width, a screen reader on the live region, against a real Hub | S15 |
| 852 | Backup & Transfer still shows 31G commands | Open follow-up (a documentation and UI change; see the limits) |
| 853 | A real elevated wizard run: the single prompt, the pipe from the elevated process including a standard user using another administrator's credentials, the whole flow against a real service, the restart ending the session, the wizard in each theme with a screen reader; the 20-minute idle close and 5-minute wait | S2 (themes and screen reader: S15 steps applied to the wizard) |
| 854 | First green CI runs of `hub-s3`, `backup-scale`, the extended `docker-smoke` and Linux `70-platform`; an elevated `check:hub-service`; throughput on a slower runner | S17, S1.4 |
| 854 | A real Cloudflare tunnel, real Google sign-in, direct Public mode, a second-machine restore and a standby promotion | S3, S6, S8, S12, S13 |
| 855 | The blob garbage collector has no owner-reachable command | Not runnable; wiring it is a later decision (recorded in the limits) |
| 856 | Real Google Drive: the OAuth client and consent screen (Testing versus Production token expiry), connect and the callback through the tunnel domain, a chunked run with a network drop, verify, drill and its API quota, prune, revocation and reconnect, a full Drive, a second-machine restore, disconnect; the 256 KiB acknowledgement granularity on a resumed chunk; the wizard step (not built) | S19 (may slip) |
| 857 | Real OneDrive: the app registration (personal accounts, the Web redirect URI, the app-folder permission, the client secret value and its expiry), connect and the callback through the tunnel domain (including whether the redirect carries `session_state`), staged fragmented runs with a network drop, verify, drill and any throttling, the real upload and download hosts against the Hub's host allowlist, refresh-token rotation over many runs and a restart, prune and the recycle bin quota, revocation at account.microsoft.com and reconnect, a full OneDrive, a second-machine restore, disconnect (no revocation call exists); the wizard step (not built) | S20 (may slip) |

## Results

Fill one row per pass in the commit that runs it.

| Pass | Blocking | Status | Date | Machine and versions | Evidence | Notes |
|---|---|---|---|---|---|---|
| S1 Installed Hub, provisioning, `check:hub-service` | Yes | Pending | | | | |
| S2 Desktop wizard, elevated | Yes (S2.3 may slip) | Pending | | | | |
| S3 Real Cloudflare Tunnel | Yes | Pending | | | | |
| S4 Public-CA trust, desktop and Agent | Yes | Pending | | | | |
| S5 Android through the tunnel domain | May slip | Pending | | | | |
| S6 Google sign-in, link, unlink | Yes | Pending | | | | |
| S7 Google unreachable | Yes | Pending | | | | |
| S8 Direct Public mode | Yes | Pending | | | | |
| S9 Gating and the Hub-offline page | Yes (Firefox may slip) | Pending | | | | |
| S10 Resumable upload over the tunnel | Yes | Pending | | | | |
| S11 Backups, drill, notifications, retention | Yes (one local, one S3) | Pending | | | | |
| S12 Second-machine restore | Yes | Pending | | | | |
| S13 Standby pull and promotion | Yes | Pending | | | | |
| S14 Power policy | Yes | Pending | | | | |
| S15 Hub-web Platform panel in a browser | May slip | Pending | | | | |
| S16 Docker parity | May slip (CI runs it) | Pending | | | | |
| S17 First green CI runs | Yes | Pending | | | | |
| S18 Vector availability | Yes (with S1) | Pending | | | | |
| S19 Google Drive destination | May slip | Pending | | | | |
| S20 OneDrive destination | May slip | Pending | | | | |
| Final consolidated automated gate | Yes | Pending | | | | |

**Closing rule.** The owed passes do not gate 32-SS2. A Fail is a defect against Phase 32-SS1 and is fixed as maintenance; a skipped pass stays Pending here, and results are recorded in the commit that runs them. A Blocking pass still Pending when 32-SS5 closes must be run or explicitly waived by a dated decision before the SaveSphere first-release checklist is ticked.

## Commands

Use Node 24 and npm 11.19; run from the repository root.

| Purpose | Command |
|---|---|
| Full regressions | `npm test`, `npm run lint`, `npm run test:electron`, `npm run test:high-consequence`, `npm run check:generated`, `npm run check:dockerfiles` |
| Hub | `npm run test:hub`, `npm run test:e2e:hub` (platform: `e2e/hub/70-platform.spec.ts`) |
| Backup at scale | `npm run test:backup-scale`, `npm run test:hub:large` (`DUDE_TEST_BIG=1`, about 2 GiB of disk) |
| S3 | `npm run test:hub:s3` (needs `DUDE_TEST_S3_ENDPOINT`; MinIO: see [Quality and Release](QUALITY_AND_RELEASE.md)) |
| Docker | `npm run smoke:hub-docker` |
| Windows payload | `npm run hub:stage`, `npm run check:hub-service -- --require` (elevated), `npm run check:hub-capabilities -- --require-vector` |
| Generated security doc | `node scripts/generate-security-doc.mjs` (must leave `SECURITY.md` unchanged) |
