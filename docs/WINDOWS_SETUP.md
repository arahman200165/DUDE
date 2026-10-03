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
| `dude-hub network mode private` / `public --i-understand-unreleased` | Set the exposure mode. Public is not released until Phase 31F: it needs the flag to be written, and the Hub still refuses to start in public mode unless `DUDE_HUB_UNRELEASED_PUBLIC=1` is set in its environment. |
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
| `dude-hub doctor` | Diagnose the service, certificates, port and firewall rule. |
| `dude-hub setup-token` | Print or deliver the one-time token for first-owner setup. |
| `dude-hub owner reset` | Start a two-step owner reset (confirm with the printed token). |

### Behind a reverse proxy

A reverse proxy (Caddy, nginx, IIS ARR) can publish the Hub under a name and certificate you already manage. The Hub then trusts `X-Forwarded-For`, `-Host` and `-Proto` only from the proxy addresses you list (one hop), requires browser `Origin` headers to equal the public origin, hands the public origin out in pairing, and sends HSTS (the proxy terminates the browser's TLS). Direct connections to the Hub are accepted only for loopback host names.

1. `dude-hub network proxy on --trusted 127.0.0.1 --public-origin https://hub.example.com` (elevated). The Hub restarts on loopback only and the public name joins the Host allowlist.
2. Point the proxy at the Hub over HTTPS, verifying the Hub with its exported root (`dude-hub tls ca export`, then convert to PEM) rather than skipping verification. A minimal Caddyfile:

   ```
   hub.example.com {
       reverse_proxy https://127.0.0.1:47600 {
           transport http {
               tls_trusted_ca_certs C:\ProgramData\DudeHub\dude-hub-root.pem
           }
       }
   }
   ```

   Caddy sets `X-Forwarded-For`, `-Host` and `-Proto` itself and overwrites any client-supplied values. Do not use `tls_insecure_skip_verify`.
3. Devices connect through the proxy, so they must pin the proxy's certificate: `dude-hub tls proxy-pin add <caddy-leaf.pem>`.
4. Wait until enrolled devices acknowledge the staged pin (`dude-hub tls proxy-pin list`), then `dude-hub tls proxy-pin activate` (preview, then `--confirm <token>`).

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
