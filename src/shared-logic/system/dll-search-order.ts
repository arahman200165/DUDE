/**
 * Windows DLL search candidates used by Dependency Walker. This is deliberately a model of the
 * executable's default unpackaged DLL search order; SxS activation-context resolution is outside
 * this helper and must be reported as unresolved by the caller.
 */
export type DllTargetArchitecture = 'x86' | 'x64' | 'arm64' | 'unknown';
export type DllSearchSource = 'known-dll' | 'application' | 'system' | 'windows' | 'path';

export interface DllSearchContext {
  readonly applicationDirectory: string;
  readonly windowsDirectory: string;
  /** Native System32 for native/x64 images; SysWOW64 for x86 images on a 64-bit OS. */
  readonly systemDirectory: string;
  readonly syswow64Directory?: string;
  readonly targetArchitecture: DllTargetArchitecture;
  readonly pathDirectories: readonly string[];
  /** Case-insensitive DLL name -> resolved KnownDLL path, or true when the file is in systemDirectory. */
  readonly knownDlls?: Readonly<Record<string, string | true>>;
  /** Optional KnownDLL map from the 32-bit registry view for x86 images. */
  readonly knownDllsX86?: Readonly<Record<string, string | true>>;
  /** Case-insensitive API-set contract -> one or more host DLL names. */
  readonly apiSetMap?: Readonly<Record<string, readonly string[]>>;
}

export interface DllSearchCandidate {
  readonly path: string;
  readonly source: DllSearchSource;
  readonly requestedName: string;
  readonly resolvedName: string;
}

export interface DllSearchPlan {
  readonly candidates: readonly DllSearchCandidate[];
  readonly apiSet: boolean;
  readonly apiSetResolved: boolean;
  readonly sxsUnresolved: boolean;
}

const API_SET_PREFIX = /^(?:api|ext)-/i;
const SXS_PREFIX = /^Microsoft\.\w+\.(?:v\d+|CRT)\./i;

function trimSeparators(path: string): string {
  const value = path.replace(/\//g, '\\');
  if (/^[a-z]:\\$/i.test(value) || /^\\\\[^\\]+\\[^\\]+\\?$/.test(value)) return value.replace(/\\$/, '\\');
  return value.replace(/\\+$/, '');
}

function joinWindows(directory: string, name: string): string {
  const base = trimSeparators(directory);
  return base ? `${base}\\${name}` : name;
}

function keyOf(value: string): string { return value.toLowerCase(); }

function selectedSystemDirectory(context: DllSearchContext): string {
  if (context.targetArchitecture === 'x86' && context.syswow64Directory) return context.syswow64Directory;
  return context.systemDirectory;
}

/**
 * Return the ordered candidate paths for an import. An API-set contract is translated to its
 * mapped host(s) before applying the ordinary directory order. KnownDLLs are a direct binding and
 * therefore yield at most one candidate at the highest priority.
 */
export function planDllSearch(importName: string, context: DllSearchContext): DllSearchPlan {
  const requestedName = importName.trim();
  if (!requestedName || /[\0\r\n]/.test(requestedName)) {
    return { candidates: [], apiSet: false, apiSetResolved: false, sxsUnresolved: false };
  }

  const sxsUnresolved = SXS_PREFIX.test(requestedName) || requestedName.includes(',');
  const apiSet = API_SET_PREFIX.test(requestedName);
  if (sxsUnresolved) return { candidates: [], apiSet, apiSetResolved: false, sxsUnresolved: true };

  let names = [requestedName];
  let apiSetResolved = false;
  if (apiSet) {
    // The loader matches an API-set name without its trailing "-<n>" (the schema stores the highest
    // supported revision), so l1-2-0 and l1-2-3 resolve to the same entry.
    const contractKey = (name: string) => keyOf(name.replace(/\.dll$/i, '').replace(/-\d+$/, ''));
    const requestedKey = contractKey(requestedName);
    const mapping = Object.entries(context.apiSetMap ?? {}).find(([contract]) => contractKey(contract) === requestedKey)?.[1];
    if (!mapping?.length) return { candidates: [], apiSet: true, apiSetResolved: false, sxsUnresolved: false };
    names = mapping.map((name) => name.toLowerCase().endsWith('.dll') ? name : `${name}.dll`);
    apiSetResolved = true;
  }

  const candidates: DllSearchCandidate[] = [];
  const seen = new Set<string>();
  const add = (name: string, source: DllSearchSource, path: string) => {
    const key = keyOf(path.replace(/\//g, '\\'));
    if (!seen.has(key)) { seen.add(key); candidates.push({ path, source, requestedName, resolvedName: name }); }
  };

  for (const name of names) {
    const knownSet = context.targetArchitecture === 'x86' ? (context.knownDllsX86 ?? context.knownDlls) : context.knownDlls;
    const known = Object.entries(knownSet ?? {}).find(([dll]) => keyOf(dll) === keyOf(name));
    if (known) {
      const knownPath = known[1] === true ? joinWindows(selectedSystemDirectory(context), name) : known[1];
      add(name, 'known-dll', knownPath);
      continue;
    }
    add(name, 'application', joinWindows(context.applicationDirectory, name));
    add(name, 'system', joinWindows(selectedSystemDirectory(context), name));
    add(name, 'windows', joinWindows(context.windowsDirectory, name));
    for (const directory of context.pathDirectories) add(name, 'path', joinWindows(directory, name));
  }
  return { candidates, apiSet, apiSetResolved, sxsUnresolved: false };
}

/** Summarize the limitations the UI must surface for this plan. */
export function dllSearchLimitation(plan: DllSearchPlan): string | undefined {
  if (plan.sxsUnresolved) return 'Side-by-side manifest/activation-context resolution is not implemented.';
  if (plan.apiSet && !plan.apiSetResolved) return 'The API-set contract was not present in the helper API-set map.';
  return undefined;
}

