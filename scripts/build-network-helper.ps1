$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$locator = 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $locator)) { throw 'Visual Studio Build Tools locator is missing.' }
$env:PATH = (Split-Path -Parent $locator) + ';' + $env:PATH
$installation = & $locator -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $installation) { throw 'MSVC x64 build tools are required to package the network helper.' }
$vcvars = Join-Path $installation 'VC\Auxiliary\Build\vcvars64.bat'
if (-not (Test-Path -LiteralPath $vcvars)) { throw 'MSVC x64 environment script is missing.' }
New-Item -ItemType Directory -Path (Join-Path $projectRoot 'build') -Force | Out-Null
Push-Location $projectRoot
try {
  $compile = '"{0}" >nul && cl /nologo /std:c++17 /EHsc /O2 /Fo:build\network-icmp.obj /Fe:build\network-icmp.exe native\network-icmp.cpp /link ws2_32.lib iphlpapi.lib shell32.lib advapi32.lib' -f $vcvars
  & cmd.exe /c $compile
  if ($LASTEXITCODE -ne 0) { throw "Network helper compilation failed with code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath 'build\network-icmp.exe')) { throw 'Network helper output is missing.' }
  # Phase 29 (Milestone 523): the read-only Windows attribute helper used by the fs utility process.
  $compileFs = '"{0}" >nul && cl /nologo /std:c++17 /EHsc /O2 /Fo:build\fs-attrs.obj /Fe:build\fs-attrs.exe native\fs-attrs.cpp' -f $vcvars
  & cmd.exe /c $compileFs
  if ($LASTEXITCODE -ne 0) { throw "Filesystem attribute helper compilation failed with code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath 'build\fs-attrs.exe')) { throw 'Filesystem attribute helper output is missing.' }
  # Phase 31 (Milestone 593): the Windows system helper (read-only process/network/registry RPC).
  New-Item -ItemType Directory -Path 'build\windows-sys' -Force | Out-Null
  $compileSys = '"{0}" >nul && cl /nologo /std:c++17 /EHsc /O2 /W4 /Fo:build\windows-sys\ /Fe:build\windows-sys.exe native\windows-sys\*.cpp /link advapi32.lib iphlpapi.lib ws2_32.lib ntdll.lib version.lib wintrust.lib crypt32.lib dbghelp.lib user32.lib wevtapi.lib netapi32.lib' -f $vcvars
  & cmd.exe /c $compileSys
  if ($LASTEXITCODE -ne 0) { throw "Windows system helper compilation failed with code $LASTEXITCODE." }
  if (-not (Test-Path -LiteralPath 'build\windows-sys.exe')) { throw 'Windows system helper output is missing.' }
} finally { Pop-Location }
