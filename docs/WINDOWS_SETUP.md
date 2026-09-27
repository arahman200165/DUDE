# Windows setup and onboarding

The GitHub Releases `DUDE-Setup-<version>.exe` is an NSIS installer. It has a native setup wizard followed by a first-launch wizard inside DUDE. The separately packaged MSIX/appx uses Windows' managed installation flow and does not show the NSIS pages.

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

## First launch

The desktop app opens a resumable wizard for workspace and startup destination, window behavior, updates and notifications, global hotkeys, optional AI provider credentials, tool settings (such as the collaboration relay), and review. Optional pages may be skipped. Open **Settings › General → Run setup wizard again** to change those choices later. A manual installer run reopens the wizard with current values filled in; a silent auto-update does not.

Window settings include close to tray or quit, launch minimized, preferred monitor, and remembered size and position. If the chosen monitor is absent, DUDE centers its window on the primary display. AI credentials use the existing OS-backed secure store. The theme remains dark.

Updates have three modes: automatic download, check and notify, or manual check. Installing a downloaded update always requires **Restart & Install**. Update readiness and collaboration participant changes have separate notification switches.

## Opening from Explorer

An Explorer launch starts DUDE if necessary or forwards the path to the existing instance. Supported files open in their matching tools; `.js` and `.ts` open in JS Playground, and `.html` opens in HTML Preview. Imported code and HTML wait for **Run** or **Preview**. JS Playground shows a TypeScript compatibility note for `.ts`. Unreadable and unsupported paths show an error. Paths received during onboarding wait until setup is finished or skipped.

## Build and verification

From the repo root, `npm run electron:package` builds Angular, compiles Electron, and packages both NSIS and MSIX/appx. `npm test` runs unit tests and `npm run test:e2e` runs browser end-to-end tests. Windows installer smoke checks should cover each preset, Custom, current-user/all-users scopes, cancellation, a manual reinstall, a silent update, uninstall, Explorer file and folder actions, default-app guidance, and restored window placement after a monitor is disconnected. Use a disposable Windows environment for installation tests.
