param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$guid = '1a8c8bd9-9e16-5c53-851e-b8c3f19972bb'
$expectedVersion = '0.0.27'
$installRoot = 'C:\Program Files'
$packageRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\release\win-unpacked'))
$uninstallKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
$installKey = "HKLM:\Software\$guid"
$uninstallRegKey = "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
$installRegKey = "HKLM\Software\$guid"
$markers = @('Uninstall DUDE.exe', 'file-associations.json', 'setup-options.ini', 'setup-request.ini')

$uninstall = Get-ItemProperty -LiteralPath $uninstallKey
$install = Get-ItemProperty -LiteralPath $installKey
if ($uninstall.DisplayName -ne "DUDE $expectedVersion" -or
    $uninstall.UninstallString -ne '"C:\Program Files\Uninstall DUDE.exe" /allusers' -or
    $install.InstallLocation -ne $installRoot) {
  throw 'DUDE registration does not match the reported shared-folder install. No changes made.'
}
if (-not (Test-Path -LiteralPath $packageRoot)) { throw 'The local DUDE package is missing. No changes made.' }
$packageJsonPath = Join-Path $PSScriptRoot '..\package.json'
if (-not (Test-Path -LiteralPath $packageJsonPath)) { throw "$packageJsonPath is missing. No changes made." }
$packageVersion = (Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json).version
if ($packageVersion -ne $expectedVersion) {
  throw "The local package is version $packageVersion, not $expectedVersion. Check out and build tag v$expectedVersion into release\win-unpacked before running this repair, so the file comparison below covers the exact set of files the broken install placed in Program Files. No changes made."
}
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'DUDE.exe'))) { throw "$installRoot\DUDE.exe is missing. No changes made." }
if (-not (Test-Path -LiteralPath (Join-Path $installRoot 'Uninstall DUDE.exe'))) { throw "$installRoot\Uninstall DUDE.exe is missing. No changes made." }
if ((Get-Item -LiteralPath (Join-Path $installRoot 'DUDE.exe')).VersionInfo.ProductName -ne 'DUDE' -or
    (Get-Item -LiteralPath (Join-Path $installRoot 'Uninstall DUDE.exe')).VersionInfo.ProductName -ne 'DUDE') {
  throw 'DUDE executables could not be identified. No changes made.'
}
if (Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(DUDE|Uninstall DUDE|DUDE-Setup).*\.exe$' }) {
  throw 'DUDE or DUDE Setup is running. Quit it before repair. No changes made.'
}
$packageFiles = @(Get-ChildItem -LiteralPath $packageRoot -Recurse -File)
$packageEntries = @(Get-ChildItem -LiteralPath $packageRoot -Force)
$installedNested = @(Get-ChildItem -LiteralPath (Join-Path $installRoot 'resources'),(Join-Path $installRoot 'locales') -Recurse -File)
$expectedNested = @($packageFiles | Where-Object {
  $_.FullName.Substring($packageRoot.Length + 1) -match '^(resources|locales)\\'
})
if ($installedNested.Count -ne $expectedNested.Count) {
  throw 'Unexpected files exist in Program Files\resources or Program Files\locales. No changes made.'
}
foreach ($file in $packageFiles) {
  $relative = $file.FullName.Substring($packageRoot.Length + 1)
  $target = [IO.Path]::GetFullPath((Join-Path $installRoot $relative))
  if (-not $target.StartsWith("$installRoot\", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Unsafe package path: $relative. No changes made."
  }
  if (-not (Test-Path -LiteralPath $target)) { throw "Installed file missing: $relative. No changes made." }
  $installed = Get-Item -LiteralPath $target
  if ($installed.Length -ne $file.Length -or
      (Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $file.FullName).Hash) {
    throw "Installed file differs from the DUDE package: $relative. No changes made."
  }
}
foreach ($name in $markers) {
  if (-not (Test-Path -LiteralPath (Join-Path $installRoot $name))) {
    throw "DUDE marker missing: $name. No changes made."
  }
}
if ($VerifyOnly) {
  Write-Output "Verified: all $($packageFiles.Count) installed files match DUDE's package, and no extra files exist in its resources/locales folders."
  return
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script in an administrator PowerShell window. No changes made.'
}

$backup = Join-Path $env:ProgramData ('DUDE\InstallerRecovery\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$quarantine = Join-Path $backup 'quarantined-program-files'
New-Item -ItemType Directory -Path $quarantine | Out-Null
& reg.exe export $uninstallRegKey (Join-Path $backup 'uninstall.reg') /y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not back up the uninstall key. No changes made.' }
& reg.exe export $installRegKey (Join-Path $backup 'install.reg') /y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not back up the install key. No changes made.' }

$moved = [System.Collections.Generic.List[string]]::new()
try {
  foreach ($entry in $packageEntries) {
    $source = [IO.Path]::GetFullPath((Join-Path $installRoot $entry.Name))
    if (-not $source.StartsWith("$installRoot\", [StringComparison]::OrdinalIgnoreCase)) {
      throw "Unsafe move source: $source"
    }
    Move-Item -LiteralPath $source -Destination (Join-Path $quarantine $entry.Name)
    $moved.Add($entry.Name)
  }
  foreach ($name in $markers) {
    Move-Item -LiteralPath (Join-Path $installRoot $name) -Destination (Join-Path $quarantine $name)
    $moved.Add($name)
  }
  Remove-Item -LiteralPath $uninstallKey -Recurse -Force
  Remove-Item -LiteralPath $installKey -Recurse -Force
} catch {
  foreach ($name in $moved) {
    Move-Item -LiteralPath (Join-Path $quarantine $name) -Destination (Join-Path $installRoot $name) -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path -LiteralPath $uninstallKey)) {
    & reg.exe import (Join-Path $backup 'uninstall.reg') | Out-Null
  }
  if (-not (Test-Path -LiteralPath $installKey)) {
    & reg.exe import (Join-Path $backup 'install.reg') | Out-Null
  }
  throw "Repair stopped and restoration was attempted. Backup: $backup. Error: $_"
}
Write-Output "Shared-folder DUDE installation quarantined. Backup: $backup"
