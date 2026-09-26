# Golden corpus fixture: `dotnet-apphost.macho`

Real, toolchain-produced ARM64 Mach-O (DUDE_PRD.md §21 Phase 23 Item 6 — a representative
real-world sample, not a hand-synthesized minimal structure). Dev-time test fixture only; not
referenced by `angular.json`'s `assets` globs, so it never ships in the app bundle.

## Provenance

Built cross-platform from Windows — `dotnet publish -r osx-arm64` fetches the prebuilt
`Microsoft.NETCore.App.Host.osx-arm64` apphost package and relinks it; no macOS machine or
Xcode toolchain is required, and the output is a genuine, real Mach-O (verified by its magic
bytes and by `macho-header-viewer-logic.spec.ts` reproducing load-command/dylib data LIEF
independently reads from the same file):

```sh
dotnet new console -o app
cd app
dotnet publish -c Release -r osx-arm64 --self-contained false -p:UseAppHost=true -o out-osx
# fixture is out-osx/app (no extension — this is renamed to .macho for repo clarity)
```

Built with .NET SDK 10.0.202 on 2026-09-25.

## Independent cross-check

Field values asserted in `macho-header-viewer-logic.spec.ts`'s golden-corpus test were read with
Python's `lief` library, not derived from DUDE's own parser:

```py
import lief
b = lief.parse('dotnet-apphost.macho')
b.header.cpu_type, b.header.file_type   # ARM64, EXECUTE
[str(d.name) for d in b.libraries]      # /usr/lib/libSystem.B.dylib, /usr/lib/libc++.1.dylib
```
