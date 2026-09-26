# Golden corpus fixture: `dotnet-apphost.elf`

Real, toolchain-produced x86-64 ELF (DUDE_PRD.md §21 Phase 23 Item 6 — a representative
real-world sample, not a hand-synthesized minimal structure). Dev-time test fixture only; not
referenced by `angular.json`'s `assets` globs, so it never ships in the app bundle.

## Provenance

Built cross-platform from Windows — `dotnet publish -r linux-x64` fetches the prebuilt
`Microsoft.NETCore.App.Host.linux-x64` apphost package and relinks it; no Linux machine, gcc, or
WSL toolchain is required, and the output is a genuine, real ELF (verified by its magic bytes and
by `elf-header-viewer-logic-golden.spec.ts` reproducing dynamic-symbol/section data pyelftools
independently reads from the same file):

```sh
dotnet new console -o app
cd app
dotnet publish -c Release -r linux-x64 --self-contained false -p:UseAppHost=true -o out-linux
# fixture is out-linux/app (no extension — Linux binaries don't use one)
```

Built with .NET SDK 10.0.202 on 2026-09-25.

## Independent cross-check

Field values asserted in `elf-header-viewer-logic.spec.ts`'s golden-corpus test were read with
Python's `pyelftools` library, not derived from DUDE's own parser:

```py
from elftools.elf.elffile import ELFFile
elf = ELFFile(open('dotnet-apphost.elf', 'rb'))
elf.header['e_type'], elf.header['e_machine']   # ET_DYN, EM_X86_64
elf.get_section_by_name('.dynsym').num_symbols() # 104
[elf.get_section(i).name for i in range(elf.num_sections())]
```
