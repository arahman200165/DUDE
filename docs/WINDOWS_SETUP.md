# Windows setup and onboarding

The GitHub Releases `DUDE-Setup-<version>.exe` is an NSIS installer. It has a native setup wizard followed by a first-launch wizard inside DUDE. The desktop ships as NSIS only (the MSIX/appx target was dropped, PD-025).

## Installer choices

Windows requests administrator permission as soon as the installer or uninstaller opens, before any setup page appears. If you enter credentials for a different administrator account, current-user installs and optional data deletion apply to that administrator account. A standard user who supplies different administrator credentials cannot target their own profile with the current-user option or the optional data-deletion checkbox; an all-users install remains available.

The welcome page offers an Express preset or **Custom**. Custom starts from the selected preset and opens pages for location, shortcuts and login launch, update policy, Explorer actions, and individual file types. Back and Next let you review choices before installation.

| Preset | Scope | Shortcuts | Explorer | File types | Login | Updates |
| --- | --- | --- | --- | --- | --- | --- |
| Minimal | Current user | Start | None | None | Off | Manual check |
| Standard | Current user | Start, desktop | File and folder action | None | Off | Check and notify |
| Fully Integrated | All users | Start, desktop | File and folder action | All supported types | On | Automatic download |

Custom can change the installation scope on Windows' scope page and the installation folder on DUDE's location page. Choosing a parent such as C:\Program Files installs into its DUDE subfolder; Setup rejects source checkouts and shared parent folders. The supported file types are `.json`, `.yaml`, `.yml`, `.xml`, `.csv`, `.md`, `.txt`, `.toml`, `.ini`, `.sql`, `.js`, `.ts`, `.html`, and `.css`. The Explorer action adds **Open with DUDE** for supported files; the folder action opens Directory Diff with the selected folder on the left.

Selecting file types registers DUDE as a candidate in Windows Default Apps. It does not take over defaults. Open Windows **Settings → Apps → Default apps** and choose DUDE for each type you want to make a default. The onboarding review page can open that Windows screen.

The installer saves its choices for a later manual `.exe` reinstall or upgrade. A silent auto-update keeps the installed scope, shortcuts, and registrations and does not ask setup questions. Uninstall removes DUDE shortcuts and registry registrations, leaving app data and personal settings in the Windows user profile.

## Interrupted upgrades with an invalid install path

If Setup says DUDE cannot be closed but no DUDE process is running, check the registered uninstall path before retrying. A registration with an empty install location and an uninstall command like `"\Uninstall DUDE.exe" /allusers` can point at the drive root. Do not run that uninstaller. For the known 0.0.26 root-path case, `scripts/repair-broken-nsis-install.ps1` verifies the exact registration and quarantines DUDE-owned root files. For the 0.0.27 shared `C:\Program Files` case, `scripts/repair-shared-program-files-install.ps1` compares installed files with the local package before quarantining only those DUDE files. Both scripts back up registry keys, require administrator rights for repair, and support `-VerifyOnly` for a read-only check. Then rerun Setup and confirm the review page shows `C:\Program Files\DUDE` or another dedicated DUDE folder.

## The DUDE Hub (optional)

The Hub is a separate, optional Windows service that lets your devices sync through this computer. It has its own installer and its own **Apps & Features** entry ("DUDE Hub"); it installs to `%ProgramFiles%\DUDE Hub` and keeps its data in `%ProgramData%\DUDE\Hub`.

### Installing the Hub

- **From the desktop installer.** An interactive install shows an optional page, **Also install the DUDE Hub (runs as a Windows service on this computer)**, off by default, with a LAN sub-option. When ticked, Setup runs the embedded `DUDE-Hub-Setup.exe /S [/LAN]` after the desktop files are installed. Silent and auto-update runs never install the Hub, and the page is skipped when a Hub is already installed.
- **Standalone.** Download `DUDE-Hub-Setup.exe` from the GitHub release (it is also in the DUDE folder under `resources`). It asks for administrator permission, offers the LAN checkbox (default off) and installs and starts the service. `DUDE-Hub-Setup.exe /S` is silent; add `/LAN` for LAN mode. Running it again on an installed Hub updates it.

LAN mode lets other computers on your private network reach the Hub. It opens a Windows Firewall rule for the Private network profile only. The Hub is HTTPS-only and devices pin its certificate.

### Managing the service

Run these from an elevated prompt (the Hub CLI is `"%ProgramFiles%\DUDE Hub\dude-hub.exe"`):

| Command | What it does |
| --- | --- |
| `dude-hub service status` / `restart` | Service state, reachability and the registered-device count; stop and start the service. |
| `dude-hub network lan on` / `off` / `status` | Turn LAN mode (and its firewall rule) on or off. |
| `dude-hub network status` | Show the bind, exposure mode, configured names, reverse-proxy summary (trusted count, public origin) and whether HSTS is sent. |
| `dude-hub network proxy on --trusted <cidr>[,<cidr>...] --public-origin https://<name>[:<port>]` | Reverse-proxy mode: trust only those proxy addresses for `X-Forwarded-*`, serve the public origin, listen on loopback only, remove the LAN firewall rule and restart. |
| `dude-hub network proxy off` / `status` | Leave reverse-proxy mode (the Hub keeps listening on loopback; run `network lan on` to re-expose it) or show the proxy settings. |
| `dude-hub network mode private` | Return to private mode (unrestricted). |
| `dude-hub network mode public [--accept-unverified-reachability] --type "EXPOSE HUB TO THE INTERNET"` | Expose the Hub to the Internet. The running Hub checks readiness (see "Exposing the Hub to the Internet"); without `--type` it prints the readiness report and changes nothing. Needs an elevated prompt and a running Hub. |
| `dude-hub tls ca init [--suffix <dns>]...` | Opt an existing Hub in to the built-in local CA (new Hubs use it by default): creates the CA and stages a CA-issued certificate with a new key; activate it with `dude-hub tls activate`. Elevated when the service is installed. |
| `dude-hub tls ca status` | Show the root fingerprint and validity, its permitted name subtrees, whether the active certificate is CA-issued, and its expiry. |
| `dude-hub tls ca export [--out <file.cer>]` | Write the public root as DER (default `dude-hub-root.cer`) and print the `certutil -user -addstore Root` command that trusts it for the current user. |
| `dude-hub tls names list` | Show the configured Hub names, the active certificate's names and any names it is missing. |
| `dude-hub tls names add <name>` | Add a DNS name or IP (optionally `name:port`) to the Host allowlist and stage a re-issued certificate; activate it with `dude-hub tls activate` once devices acknowledge. |
| `dude-hub tls names remove <name>` | Remove a configured name and stage a certificate without it. |
| `dude-hub tls import --cert <pem> --key <pem> [--chain <pem>]` | Validate an operator certificate (key match, 7+ days left, leaf, serverAuth, covers every configured name and the canonical origin, chain links) and stage it as the next certificate; activate it with `dude-hub tls activate`. Never auto-renewed. Elevated when the service is installed. |
| `dude-hub tls proxy-pin add <pem-or-spki>` | Reverse-proxy deployments: stage the proxy's leaf SPKI as a proxy pin and announce it to devices. |
| `dude-hub tls proxy-pin activate [--force] [--confirm <token>]` | Two-step: preview (lists devices that have not acknowledged), then `--confirm` promotes the staged proxy pin. |
| `dude-hub tls proxy-pin remove <spki> [--confirm <token>]` | Two-step removal; removing the active proxy pin means devices can no longer connect through the proxy. |
| `dude-hub tls proxy-pin list` | Show the active and staged proxy pins and pending acknowledgements. |
| `dude-hub doctor [--json]` | Diagnose the service, exposure, certificate, proxy pins, firewall rule and realtime health with the 13 readiness checks (each marked verified, operator-claimed or not-checked, with the exact elevated fix command). Plain output is the checklist followed by a `--- details ---` JSON block; `--json` prints the report only. It works with the service stopped from the configuration and public files. The same report is in Settings › Endpoint & Exposure. |
| `dude-hub setup-token` | Print or deliver the one-time token for first-owner setup. |
| `dude-hub owner reset` | Start a two-step owner reset (confirm with the printed token). |

### Trusting the Hub in a browser

New Hubs issue their certificate from a built-in local certificate authority (the root is name-constrained to private names and address ranges, so it cannot vouch for public sites). Devices pin the Hub's certificate and need no root; browsers need the root once per computer, otherwise they show a certificate warning and the Hub web cannot register its service worker.

1. **On the Hub computer, from DUDE Desktop.** In **Settings › Environment & Hub**, choose **Install root certificate** under **Hub web**. DUDE shows the root's subject and SHA-256, then adds it to your current-user trusted roots with `certutil -user` after you confirm (no administrator rights; Windows shows its own security prompt for adding a root).
2. **On another PC.** Run `dude-hub tls ca export` on the Hub computer (or download the root from Settings › Endpoint & Exposure in the Hub web), copy the `.cer` and run `certutil -user -addstore Root <file.cer>` there. Edge and Chrome use the Windows store.
3. **Firefox** has its own store: import the `.cer` under Settings › Privacy & Security › Certificates › View Certificates › Authorities, or set `security.enterprise_roots.enabled` in `about:config` to trust the Windows store.
4. Existing Hubs keep their self-signed certificate until you run `dude-hub tls ca init` (elevated, with the service running) and activate the staged certificate; a Hub with configured names (`dude-hub tls names add`) re-issues the certificate for them. `dude-hub doctor` reports missing names.

### Exposing the Hub to the Internet

Public mode is released behind an elevated readiness gate (Phase 31F, Milestones 683–699). `dude-hub network mode public` refuses until the Hub proves it is ready, and lists every blocker with the command that fixes it. Do these in order from an elevated prompt on the Hub computer:

1. **Pick public DNS names** you control (not an IP address and not `.local`/`.lan`/`.internal`) and point them at your router's public address: `dude-hub tls names add hub.example.com`.
2. **Get a browser-trusted certificate.** Either issue one: `dude-hub tls acme issue --name hub.example.com --agree-tos --open-firewall` (needs port 80 reachable for a moment), or import one with `dude-hub tls import --cert <file> --key <file>`, or put the Hub behind a reverse proxy that already has one (`dude-hub network proxy on ...`; see "Behind a reverse proxy"). A self-signed or local-CA certificate is a blocker: phones and browsers outside your network cannot trust a private CA.
3. **Activate the certificate:** `dude-hub tls activate`.
4. **Listen on the network:** `dude-hub network lan on` (not needed behind a reverse proxy).
5. **Open the public firewall rule:** `dude-hub network firewall public on --force` (the rule must exist before the mode is switched; `--force` is needed only because the Hub is still private), and forward the port on your router.
6. **Verify reachability from outside** (next section), from a phone on cellular data. The record must be no older than 7 days. If you cannot test, `--accept-unverified-reachability` turns this one blocker into an audited warning.
7. **Switch the mode** with the phrase: `dude-hub network mode public --type "EXPOSE HUB TO THE INTERNET"`. Run it without `--type` first to see the readiness report. Then `dude-hub service restart` applies it.

Blockers: certificate not browser-trusted, no public DNS name, certificate not covering the names or expiring within 7 days, no owner set up (`dude-hub setup-token`), the Public firewall rule missing or invalid, an Agent TCP listener, a loopback-only bind without a proxy, and reachability not verified. Warnings (shown, not blocking): address stability (private or CGNAT addresses), DNS resolution and HSTS. The Hub starts in public mode whatever its certificate state (an expiring certificate never causes an outage; `doctor` and the alerts report it), but refuses to start when it is bound to loopback without a proxy. `dude-hub network mode private` undoes it at any time.

### Verifying the Hub is reachable from the Internet

The Hub verifies reachability itself, by looking at where a request comes from. On a phone using cellular data (Wi-Fi off), or any device on another network, open the Hub web through its public name (for example `https://hub.example.com:47821`), sign in, and open Settings › Endpoint & Exposure › Reachability › Verify from this browser. The Hub reports the kind of address it saw (never the address itself) and, when it was a public address on one of the Hub's configured names (behind a reverse proxy: the proxy's public origin), records the verification. The "Reachable from outside" check then passes for 7 days; after that, verify again.

On the desktop app, the same block has a **Test from this device** button: type (or accept the prefilled) public address of the Hub, such as `https://hub.example.com:47821`, and this PC's Device Agent calls the Hub through that public name with its device credential; the Hub judges the request exactly as above. Run it from a device outside your home or office network (for example a laptop on a phone hotspot); from inside your network it proves nothing. The address must be an `https://` origin (no user name, path or query). The certificate must be the Hub's pinned one or one a public authority vouches for (for example an ACME certificate); anything else fails as untrusted and is never accepted unverified.

- A request from the same network (a private, CGNAT or loopback address) proves nothing and records nothing. If the public name works from inside your LAN only because your router loops the request back (hairpin NAT), the Hub sees a private address and correctly does not count it, so test from outside.
- A request through an IP address instead of a name is not counted either; use the DNS name.
- If it works from cellular but the check stays unverified, the Hub may be answering through a reverse proxy that is not configured as trusted; see "Behind a reverse proxy".

### Behind a reverse proxy

A reverse proxy (Caddy, nginx, IIS ARR) can publish the Hub under a name and certificate you already manage. The Hub then trusts `X-Forwarded-For`, `-Host` and `-Proto` only from the proxy addresses you list (one hop), requires browser `Origin` headers to equal the public origin, hands the public origin out in pairing, and sends HSTS (the proxy terminates the browser's TLS). Direct connections to the Hub are accepted only for loopback host names.

1. `dude-hub network proxy on --trusted 127.0.0.1 --public-origin https://dude.internal` (elevated). The Hub restarts on loopback only and the public name joins the Host allowlist.
2. Point the proxy at the Hub over HTTPS, verifying the Hub with its exported root (`dude-hub tls ca export`, then convert to PEM) rather than skipping verification. A minimal Caddyfile:

   ```
   dude.internal {
       reverse_proxy https://127.0.0.1:47600 {
           transport http {
               tls_trusted_ca_certs C:\ProgramData\DUDE\Hub\dude-hub-root.pem
           }
       }
   }
   ```

   Caddy sets `X-Forwarded-For`, `-Host` and `-Proto` itself and overwrites any client-supplied values. Do not use `tls_insecure_skip_verify`.
3. Devices connect through the proxy, so they must pin the proxy's certificate: `dude-hub tls proxy-pin add <caddy-leaf.pem>`.
4. Wait until enrolled devices acknowledge the staged pin (`dude-hub tls proxy-pin list`), then `dude-hub tls proxy-pin activate` (preview, then `--confirm <token>`).

### Dynamic addresses and DNS

If the Hub is reached by a DNS name and your home or office address changes, the name must follow it. DUDE never does this for you: the Hub does not update DNS and stores no DNS credential. It only detects and explains.

- `dude-hub doctor` (and Settings > Endpoint) shows two checks. **Address stability** lists this machine's addresses and warns when they changed since last recorded, or when public mode has only private or CGNAT addresses. **DNS points at this machine** compares what your configured names resolve to with the machine's interface addresses. A match passes; an address that is not on this machine is informational (a router port forward, a reverse proxy or stale DNS look the same from inside the machine); a name that does not resolve warns. Neither check proves the port is reachable from outside.
- A change of address is also recorded as a "Hub address changed" security alert, and the Hub prints an `addresses-changed` line when it starts with a different address set.
- To keep DNS pointing at the Hub, run a DDNS client on the router, or your DNS provider's update client on any always-on machine, and keep that credential there, not in DUDE.
- CGNAT (a 100.64.0.0/10 address on the router's WAN side) cannot accept inbound connections: ask your ISP for a public address, use a public IPv6 address, or use a tunnel or reverse proxy you control.
- When a name itself changes, run `dude-hub tls names add <new-name>` and then `dude-hub tls acme issue --name <new-name>`, and finish with `dude-hub tls activate` once devices acknowledge the staged certificate.

### Public mode firewall

In public (Internet) mode Windows Firewall needs a rule the LAN mode does not add. From an elevated terminal:

- `dude-hub network firewall public on` adds **DUDE Hub (Public)**: inbound TCP on the Hub port for `dude-hub.exe`, all profiles (Home/Work routers are often classed Public), any remote address. It refuses unless the Hub is in public mode (or `--force`). `public status` prints the rule as Windows reports it plus any problems (wrong port, disabled, blocked, wrong program, narrower profile); `public off` removes it.
- `dude-hub tls acme issue --name <dns> --open-firewall` opens **DUDE Hub (ACME http-01)** (port 80, or `exposure.acme.httpPort` / `--http-port`) only for the duration of the order and always removes it afterwards. Without the flag, open and close it yourself with `dude-hub network firewall acme on|off`.
- On your router, forward the Hub port (and port 80 during ACME orders) to this machine yourself. DUDE never uses UPnP or NAT-PMP.
- `dude-hub doctor` (as administrator) shows **Firewall allows public access** and **No native app port is exposed**; the second fails if `dude-agent.exe` listens on any TCP port, which it must never do. Settings > Endpoint cannot run these checks and shows them as not checked.
- Uninstalling the Hub removes both rules.

### Backups

A Hub backup is one encrypted `.dudebackup` file: a scrubbed copy of the Hub database (no sign-in sessions, tokens, pairing codes or certificate keys) and its configuration, sealed with a passphrase you choose. The Hub must be running; run these from an elevated prompt:

| Command | What it does |
| --- | --- |
| `dude-hub backup create [--folder <abs dir>]` | Two steps. The first run writes nothing: it prints the folder, the file name, what the backup will contain and a one-time token. Re-run with `--confirm <token>` (and the same `--folder`) within 60 seconds, enter the passphrase twice, and the Hub writes, re-opens and verifies the file before it keeps it. |
| `dude-hub backup list [--folder <abs dir>]` | List the backup files in a folder (default: the scheduled folder, else `backups` under the Hub data directory). Needs no elevation. |
| `dude-hub backup verify --file <abs path>` | Decrypt a backup with its passphrase and print what it contains, without changing anything. |
| `dude-hub backup schedule set --folder <abs dir> --every-hours <n> --keep <n>` | Take a backup every `n` hours and keep the newest `keep`. Asks for the passphrase once. |
| `dude-hub backup schedule off` / `status` | Stop scheduled backups, or show the schedule and the result of the last run (`status` needs no elevation). |

- **The passphrase is never a command-line flag.** The CLI reads it from the `DUDE_HUB_BACKUP_PASSPHRASE` environment variable, else the first line of standard input when it is piped, else a hidden prompt. **Losing the passphrase makes the backup unrecoverable**; DUDE cannot reset it.
- **The default folder is on the same machine as the Hub**, so it does not protect against losing that computer or its disk. Choose a folder on another drive or share, or copy the files elsewhere. The preview says so every time.
- **A schedule stores a key derived from the passphrase**, protected by Windows (DPAPI, this computer only), so unattended backups can encrypt; the passphrase itself is not stored. A schedule can be set only from this elevated CLI.
- Keep the passphrase and at least one copy of the backup somewhere safe; restoring is an offline operation and needs both.

#### Restoring a backup

`dude-hub backup restore --file <abs path> [--data-dir <dir>]` restores a backup into a Hub data directory. It is an **offline** command: the Hub (and its Windows service) must be stopped (`dude-hub service stop`), or it refuses with exit code 2. When the service is installed it also needs an elevated prompt. It is two steps, like `purge`:

1. Run it without `--confirm`. It asks for the passphrase, decrypts and validates the file, changes nothing, and prints a summary (the source Hub and its authority epoch, the new epoch, when the backup was made, what it contains, whether it was made for a transfer, and whether the target directory is empty) plus a one-time token valid for 60 seconds.
2. Re-run the same command with `--confirm <token>` (and the phrases below when the summary asks for them). It asks for the passphrase again and restores.

| Phrase | When it is needed |
| --- | --- |
| `--replace "REPLACE HUB DATA"` | The data directory already contains a Hub. Its database, `hub.json` and TLS directory are moved to `backups\replaced-<UTC stamp>\`, never deleted. |
| `--old-hub-gone "THE OLD HUB IS GONE"` | The backup was not made with `--for-transfer`, so the old Hub may still be running; two Hubs would then exist. |

The phrases are compared exactly (case-sensitive, no extra spaces). If one is missing the command says so, changes nothing and the token stays valid, so you can re-run it with the phrase.

What a restored Hub looks like:

- **A new identity.** The Hub gets a new instance id and an authority epoch one higher than the backup's, so devices can tell it from the original.
- **Devices must be paired again.** Their entries are kept but marked as needing re-pairing and their keys are revoked; each device keeps its own local data. Sign-in sessions, tokens and pairing codes are not restored. The owner signs in with the **old owner password** (owner credentials and recovery codes are restored). A re-pair code flow for devices lands later in this phase.
- **A new TLS identity.** Certificates, the local CA and ACME account keys are never in a backup; the restored Hub issues its own, so browsers and devices must trust it again. Public/Internet exposure and reverse-proxy mode are turned off (the port and configured names are kept and the Hub listens on loopback only); re-enable them with the usual elevated `network` and `tls` commands, which re-run the readiness checks. A backup schedule is not carried over either.
- The command prints the new instance id, the epoch, how many devices need re-pairing and the folder the previous data was moved to. Then start the Hub, sign in and pair each device again.

#### Moving the Hub to another machine

`dude-hub backup create --for-transfer [--folder <abs dir>]` is `backup create` plus a retirement: after the backup is written and verified, **this Hub is retired** (state `transferred`). It still answers `hello` and `status`, but it refuses sign-in, sync, web record access and pairing until you run `dude-hub backup reactivate`. Both steps (preview and `--confirm`) repeat the warning, and the confirming run must repeat `--for-transfer` (and `--folder`). Copy the file to the new machine and restore it there (no `--old-hub-gone` phrase is needed for a transfer backup), and check the new Hub before you throw anything away.

`dude-hub backup reactivate` (elevated, Hub running, two steps like `create`) returns a retired Hub to service with a new authority epoch, for example when the transfer was abandoned. It refuses with a clear message when the Hub is not retired.

### Updating the Hub

A DUDE update never touches the Hub. When the desktop notices that the bundled Hub is newer than the installed one, it offers **Update Hub** in the app; that elevates the bundled `<DUDE folder>\resources\DUDE-Hub-Setup.exe /S /UPDATE` (stop, replace, start; data migrates when the service starts; only offered for a per-machine DUDE install). You can also run the newer `DUDE-Hub-Setup.exe` yourself.

### Uninstalling the Hub

Uninstalling DUDE never removes the Hub. Remove it from **Apps & Features → DUDE Hub**. The uninstaller shows how many devices are registered ("they will lose their connection until you reinstall or move the Hub") and has a **Also delete all Hub data** checkbox, off by default; ticking it needs a second confirmation and then runs `dude-hub purge` (preview, then confirm with the typed phrase). By default the data stays in `%ProgramData%\DUDE\Hub` and the path is shown. Backups are kept even when you purge.

### Binaries are unsigned

The DUDE and Hub installers and executables are not code-signed. Windows SmartScreen shows "Windows protected your PC": choose **More info → Run anyway**. **Smart App Control** (Windows 11) can block unsigned executables outright, including the background agent and Hub when they start at sign-in; if it does, turn Smart App Control off or run DUDE without the background agent or Hub. Verify downloads against the `SHA256SUMS.txt` published with each release (`Get-FileHash <file> -Algorithm SHA256`); the staged Hub folder carries its own `SHA256SUMS`.

## Background Device Agent

DUDE starts a small per-user background process, `dude-agent.exe` (shown as **Background agent** in Settings), that holds your device identity and sync state so they keep working when the DUDE window is closed. It starts when you sign in (a per-user `HKCU\...\Run` value `DUDEDeviceAgent`, or a per-user scheduled task named `DUDE\Device Agent <id>`; no administrator rights are needed) and when DUDE starts. Turn the sign-in start on or off in Settings.

Because a running executable is locked, Setup and the uninstaller stop your agent first (`taskkill /F /IM dude-agent.exe` limited to your account, then a short wait) and the desktop starts it again at the next launch. For an all-users install, Setup cannot stop another Windows account's agent: if one is still running it says so (**close DUDE on other accounts**, then Retry). An agent left running that way is replaced by the desktop on that account's next launch when its version does not match. The uninstaller also removes the sign-in start for the uninstalling account (not on an update); other accounts' entries stay and do nothing.

## First launch

The desktop app opens a resumable wizard for workspace and startup destination, window behavior, updates and notifications, global hotkeys, optional AI provider credentials, tool settings (such as the collaboration relay), and review. Optional pages may be skipped. Open **Settings › General → Run setup wizard again** to change those choices later. A manual installer run reopens the wizard with current values filled in; a silent auto-update does not.

Window settings include close to tray or quit, launch minimized, preferred monitor, and remembered size and position. If the chosen monitor is absent, DUDE centers its window on the primary display. AI credentials use the existing OS-backed secure store. Appearance (theme, contrast mode, palette, density) is set in **Settings**; dark is the default.

Updates have three modes: automatic download, check and notify, or manual check. Installing a downloaded update always requires **Restart & Install**. Update readiness and collaboration participant changes have separate notification switches.

## Opening from Explorer

An Explorer launch starts DUDE if necessary or forwards the path to the existing instance. Supported files open in their matching tools; `.js` and `.ts` open in JS Playground, and `.html` opens in HTML Preview. Imported code and HTML wait for **Run** or **Preview**. JS Playground shows a TypeScript compatibility note for `.ts`. Unreadable and unsupported paths show an error. Paths received during onboarding wait until setup is finished or skipped.

## Build and verification

From the repo root, `npm run electron:package` builds Angular, compiles Electron, builds the Device Agent and the Hub (`hub:stage`, `hub:installer`), and packages NSIS. `npm test` runs unit tests and `npm run test:e2e` runs browser end-to-end tests. Windows installer smoke checks should cover each preset, Custom, current-user/all-users scopes, cancellation, a manual reinstall, a silent update, uninstall, Explorer file and folder actions, default-app guidance, and restored window placement after a monitor is disconnected. Use a disposable Windows environment for installation tests.
