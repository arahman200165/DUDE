import type { ToolDefinition } from '../../shared/models/tool-definition.model';
export const manifest: ToolDefinition = {
  id: 'dependency-walker', title: 'Dependency Walker',
  description: 'Recursively resolves Windows PE imports and delay-loads, checking architecture, imported symbols, forwarders, and unresolved modules.',
  category: 'developer', keywords: ['dependency walker', 'depends', 'dll', 'imports', 'PE imports', 'KnownDLLs', 'API-set', 'delay-load', 'missing DLL', 'architecture mismatch'],
  route: '/tools/dependency-walker', load: () => import('./dependency-walker').then((module) => module.DependencyWalkerTool),
  status: 'verified',
  verification: {
    crossChecked: ['MSVC dumpbin 14.44 (/imports /exports /headers /clrheader)', 'Windows loader API-set map (helper pe.apisetmap)'],
    summary:
      'The shared PE parser feeding the walker matched dumpbin on kernel32.dll, notepad.exe, mmc.exe and a .NET System.dll: import and delay-load module lists and per-module symbol counts, 1697 exports with 211 forwarders, RSDS PDB name/GUID/age, CLR header and certificate size. A live walk of notepad.exe resolved api-ms-win-* contracts through the real API-set map and KnownDLLs; ext- contracts absent from this SKU are reported as unresolved. SxS activation contexts are not modelled.',
  },
  persistence: { input: 'none', preferences: 'local' },
  capabilities: [
    { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'resolves Windows DLL dependencies using live operating-system search context in Desktop DUDE' },
    { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'opens the selected executable through the desktop file picker' },
  ],
  io: { accepts: ['file'], produces: ['json'] },
};
