# Golden corpus fixture: `dotnet-apphost.exe`

Real, toolchain-produced native x64 PE (DUDE_PRD.md §21 Phase 23 Item 6 — a representative
real-world sample, not a hand-synthesized minimal structure). Dev-time test fixture only; not
referenced by `angular.json`'s `assets` globs, so it never ships in the app bundle.

## Provenance

```sh
dotnet new console -o app
cd app
dotnet build -c Release -r win-x64 --self-contained false -p:UseAppHost=true
# fixture is bin/Release/net10.0/win-x64/app.exe
```

Built with .NET SDK 10.0.202 on 2026-09-25. This is the real native "apphost" launcher stub .NET
generates for every published app (not a hand-picked OS binary — no licensing ambiguity, since
it's produced fresh by the SDK from a trivial `dotnet new console` template).

## Independent cross-check

Field values asserted in `pe-header-viewer-logic.spec.ts`'s golden-corpus test were read with
Python's `pefile` library (2024.8.26), not derived from DUDE's own parser:

```py
import pefile
p = pefile.PE('dotnet-apphost.exe')
p.FILE_HEADER.Machine            # 0x8664
p.FILE_HEADER.NumberOfSections   # 6
p.OPTIONAL_HEADER.Subsystem      # 3
p.sections                        # .text/.rdata/.data/.pdata/.reloc/.rsrc
p.DIRECTORY_ENTRY_IMPORT          # KERNEL32.dll, USER32.dll, ADVAPI32.dll, SHELL32.dll, ...
```
