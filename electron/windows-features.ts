/** Fixed pwsh 7 scripts for M607. Caller must pass arguments through runFixedScript's base64 JSON. */
export const WINDOWS_FEATURE_SCRIPTS: Readonly<Record<string, string>> = {
  // Win32_OptionalFeature is intentionally used for a non-elevated inventory. Importing DISM
  // may itself require elevation on some systems. CIM InstallState: 1=enabled, 2=disabled.
  'feature.list': `Get-CimInstance -ClassName Win32_OptionalFeature | ForEach-Object {
  $state = switch ([int]$_.InstallState) { 1 { 'enabled' } 2 { 'disabled' } default { 'unknown' } }
  [pscustomobject]@{ name=[string]$_.Name; displayName=[string]$_.Caption; state=$state; restartNeeded=$null }
} | Sort-Object displayName, name`,
  // DISM's capability inventory is read-only. It may return per-row access/module errors on
  // constrained installations; failure of the command is surfaced to the caller.
  'feature.capabilities': `Get-WindowsCapability -Online | ForEach-Object {
  $state = switch ([string]$_.State) { 'Installed' { 'installed' } 'NotPresent' { 'not-present' } 'Staged' { 'staged' } 'InstallPending' { 'install-pending' } 'UninstallPending' { 'uninstall-pending' } default { 'unknown' } }
  [pscustomobject]@{ name=[string]$_.Name; displayName=[string]$_.DisplayName; state=$state }
} | Sort-Object displayName, name`,
  'feature.setEnabled': `if ([bool]$DudeArgs.enabled) {
  $change = Enable-WindowsOptionalFeature -Online -FeatureName ([string]$DudeArgs.name) -NoRestart -ErrorAction Stop
} else {
  $change = Disable-WindowsOptionalFeature -Online -FeatureName ([string]$DudeArgs.name) -NoRestart -ErrorAction Stop
}
$change | ForEach-Object { [pscustomobject]@{ state=[string]$_.State; restartNeeded=[bool]$_.RestartNeeded } }`,
};
