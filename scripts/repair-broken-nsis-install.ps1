param([switch]$VerifyOnly)

$ErrorActionPreference = 'Stop'
$guid = '1a8c8bd9-9e16-5c53-851e-b8c3f19972bb'
$uninstallKey = "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
$installKey = "HKLM:\Software\$guid"
$uninstallRegKey = "HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\$guid"
$installRegKey = "HKLM\Software\$guid"
$names = @('Uninstall DUDE.exe', 'file-associations.json', 'setup-options.ini', 'setup-request.ini')

$uninstall = Get-ItemProperty -LiteralPath $uninstallKey
$install = Get-ItemProperty -LiteralPath $installKey
if ($uninstall.DisplayName -ne 'DUDE 0.0.26' -or
    $uninstall.UninstallString -ne '"\Uninstall DUDE.exe" /allusers' -or
    $install.InstallLocation -ne '') {
  throw 'DUDE registration does not match the reported broken install. No changes made.'
}
if ((Get-Item -LiteralPath 'C:\Uninstall DUDE.exe').VersionInfo.ProductName -ne 'DUDE') {
  throw 'The root-level uninstaller is not identified as DUDE. No changes made.'
}
if (Test-Path -LiteralPath 'C:\DUDE.exe') {
  throw 'A DUDE executable exists at C:\. Inspect it before repair. No changes made.'
}
foreach ($name in $names) {
  if (-not (Test-Path -LiteralPath (Join-Path 'C:\' $name))) {
    throw "C:\$name is missing. No changes made."
  }
}
$running = Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match '^(DUDE|Uninstall DUDE|DUDE-Setup).*\.exe$'
}
if ($running) {
  throw 'DUDE or DUDE Setup is running. Close it before repair. No changes made.'
}
if ($VerifyOnly) {
  Write-Output 'Verified: the 0.0.26 registration has an empty install location and a root-level uninstaller.'
  return
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Run this script in an administrator PowerShell window. No changes made.'
}

$backup = Join-Path $env:ProgramData ('DUDE\InstallerRecovery\' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$copies = Join-Path $backup 'root-files'
$quarantine = Join-Path $backup 'quarantined-root-files'
New-Item -ItemType Directory -Path $copies, $quarantine | Out-Null
& reg.exe export $uninstallRegKey (Join-Path $backup 'uninstall.reg') /y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not back up the uninstall key. No changes made.' }
& reg.exe export $installRegKey (Join-Path $backup 'install.reg') /y | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not back up the install key. No changes made.' }
foreach ($name in $names) {
  $source = Join-Path 'C:\' $name
  $copy = Join-Path $copies $name
  Copy-Item -LiteralPath $source -Destination $copy
  if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $copy).Hash) {
    throw "Backup verification failed for $name. No changes made."
  }
}

$moved = [System.Collections.Generic.List[string]]::new()
try {
  foreach ($name in $names) {
    Move-Item -LiteralPath (Join-Path 'C:\' $name) -Destination (Join-Path $quarantine $name)
    $moved.Add($name)
  }
  Remove-Item -LiteralPath $uninstallKey -Recurse -Force
  Remove-Item -LiteralPath $installKey -Recurse -Force
} catch {
  foreach ($name in $moved) {
    Move-Item -LiteralPath (Join-Path $quarantine $name) -Destination (Join-Path 'C:\' $name) -ErrorAction SilentlyContinue
  }
  if (-not (Test-Path -LiteralPath $uninstallKey)) {
    & reg.exe import (Join-Path $backup 'uninstall.reg') | Out-Null
  }
  if (-not (Test-Path -LiteralPath $installKey)) {
    & reg.exe import (Join-Path $backup 'install.reg') | Out-Null
  }
  throw "Repair stopped and restoration was attempted. Backup: $backup. Error: $_"
}
Write-Output "Broken DUDE registration removed. Root files quarantined. Backup: $backup"
