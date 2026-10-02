import type { RegistryHive, RegistryView } from "@dude/contracts/system/system-types";

/**
 * Pure catalog and helpers for the Runtime Detector (DUDE_PRD.md §21 Phase 31, Milestone 600, with
 * Phase 35 items 14/15). The tool supplies PATH, registry and file-version results; nothing here
 * touches the registry, the filesystem or a process.
 */

export type RuntimeId =
  | 'git' | 'node' | 'npm' | 'pnpm' | 'yarn' | 'python' | 'java' | 'dotnet' | 'docker' | 'pwsh'
  | 'go' | 'rustc' | 'cargo' | 'ruby' | 'php' | 'deno' | 'bun';

export interface RuntimeRegistryProbe {
  /** pep514: Software\Python\<company>\<tag>\InstallPath; java-home: <path>\<version> JavaHome; dotnet-installed: value names are versions. */
  readonly kind: 'pep514' | 'java-home' | 'dotnet-installed';
  readonly hive: RegistryHive;
  readonly path: string;
  readonly view: RegistryView;
  /** dotnet-installed: what the entries are ('SDK' or 'runtime'). */
  readonly valuePattern?: string;
}

export interface RuntimeSpec {
  readonly id: RuntimeId;
  readonly label: string;
  /** File names looked for in PATH directories (lower-case). */
  readonly exeNames: readonly string[];
  readonly versionArgs: readonly string[];
  /** Where the version is printed when it is not stdout (java prints to stderr). */
  readonly versionStream?: 'stderr';
  readonly registryProbes?: readonly RuntimeRegistryProbe[];
  /** Directories checked even when they are not on PATH; `%VAR%` references are expanded by the tool. */
  readonly knownDirs?: readonly string[];
  /** Environment variables that name an install home; `bin` is searched under it. */
  readonly homeVars?: readonly string[];
  readonly versionManagers?: readonly string[];
}

const PF = '%ProgramFiles%';
const LAD = '%LOCALAPPDATA%';
const UP = '%USERPROFILE%';

export const RUNTIME_CATALOG: readonly RuntimeSpec[] = [
  { id: 'git', label: 'Git', exeNames: ['git.exe'], versionArgs: ['--version'], knownDirs: [`${PF}\\Git\\cmd`, `${PF}\\Git\\bin`, `${LAD}\\Programs\\Git\\cmd`, `${UP}\\scoop\\apps\\git\\current\\cmd`], versionManagers: ['scoop'] },
  { id: 'node', label: 'Node.js', exeNames: ['node.exe'], versionArgs: ['--version'], knownDirs: [`${PF}\\nodejs`, '%NVM_SYMLINK%', `${UP}\\.volta\\bin`], versionManagers: ['nvm', 'volta', 'fnm', 'scoop'] },
  { id: 'npm', label: 'npm', exeNames: ['npm.cmd'], versionArgs: ['--version'], knownDirs: [`${PF}\\nodejs`, '%APPDATA%\\npm'], versionManagers: ['nvm', 'volta', 'fnm'] },
  { id: 'pnpm', label: 'pnpm', exeNames: ['pnpm.cmd', 'pnpm.exe'], versionArgs: ['--version'], knownDirs: ['%APPDATA%\\npm', `${LAD}\\pnpm`], versionManagers: ['volta'] },
  { id: 'yarn', label: 'Yarn', exeNames: ['yarn.cmd', 'yarn.exe'], versionArgs: ['--version'], knownDirs: ['%APPDATA%\\npm', `${LAD}\\Yarn\\bin`], versionManagers: ['volta'] },
  {
    id: 'python', label: 'Python', exeNames: ['python.exe', 'py.exe'], versionArgs: ['--version'],
    registryProbes: [
      { kind: 'pep514', hive: 'HKLM', path: 'Software\\Python', view: '64' },
      { kind: 'pep514', hive: 'HKLM', path: 'Software\\Python', view: '32' },
      { kind: 'pep514', hive: 'HKCU', path: 'Software\\Python', view: 'default' },
    ],
    knownDirs: [`${LAD}\\Programs\\Python`, `${LAD}\\Microsoft\\WindowsApps`, `${UP}\\.pyenv\\pyenv-win\\shims`, `${UP}\\scoop\\shims`, `${LAD}\\Programs\\Python\\Launcher`, 'C:\\Windows'],
    versionManagers: ['pyenv-win', 'scoop'],
  },
  {
    id: 'java', label: 'Java', exeNames: ['java.exe'], versionArgs: ['-version'], versionStream: 'stderr', homeVars: ['JAVA_HOME'],
    registryProbes: [
      { kind: 'java-home', hive: 'HKLM', path: 'Software\\JavaSoft\\JDK', view: '64' },
      { kind: 'java-home', hive: 'HKLM', path: 'Software\\JavaSoft\\Java Development Kit', view: '64' },
      { kind: 'java-home', hive: 'HKLM', path: 'Software\\JavaSoft\\JRE', view: '64' },
      { kind: 'java-home', hive: 'HKLM', path: 'Software\\JavaSoft\\Java Runtime Environment', view: '64' },
    ],
    knownDirs: ['C:\\Program Files\\Common Files\\Oracle\\Java\\javapath', `${PF}\\Java`], versionManagers: ['scoop'],
  },
  {
    id: 'dotnet', label: '.NET', exeNames: ['dotnet.exe'], versionArgs: ['--version'], knownDirs: [`${PF}\\dotnet`, `${UP}\\.dotnet`],
    registryProbes: [
      { kind: 'dotnet-installed', hive: 'HKLM', path: 'SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sdk', view: 'default', valuePattern: 'SDK' },
      { kind: 'dotnet-installed', hive: 'HKLM', path: 'SOFTWARE\\dotnet\\Setup\\InstalledVersions\\x64\\sharedfx\\Microsoft.NETCore.App', view: 'default', valuePattern: 'runtime' },
    ],
  },
  { id: 'docker', label: 'Docker', exeNames: ['docker.exe'], versionArgs: ['--version'], knownDirs: [`${PF}\\Docker\\Docker\\resources\\bin`] },
  { id: 'pwsh', label: 'PowerShell (pwsh)', exeNames: ['pwsh.exe'], versionArgs: ['--version'], knownDirs: [`${PF}\\PowerShell\\7`, `${LAD}\\Microsoft\\WindowsApps`] },
  { id: 'go', label: 'Go', exeNames: ['go.exe'], versionArgs: ['version'], knownDirs: [`${PF}\\Go\\bin`, `${UP}\\go\\bin`], homeVars: ['GOROOT'], versionManagers: ['scoop'] },
  { id: 'rustc', label: 'Rust (rustc)', exeNames: ['rustc.exe'], versionArgs: ['--version'], knownDirs: [`${UP}\\.cargo\\bin`], versionManagers: ['rustup'] },
  { id: 'cargo', label: 'Rust (cargo)', exeNames: ['cargo.exe'], versionArgs: ['--version'], knownDirs: [`${UP}\\.cargo\\bin`], versionManagers: ['rustup'] },
  { id: 'ruby', label: 'Ruby', exeNames: ['ruby.exe'], versionArgs: ['--version'], knownDirs: ['C:\\Ruby33-x64\\bin', 'C:\\Ruby32-x64\\bin'], versionManagers: ['scoop'] },
  { id: 'php', label: 'PHP', exeNames: ['php.exe'], versionArgs: ['--version'], knownDirs: ['C:\\php', 'C:\\xampp\\php'], versionManagers: ['scoop'] },
  { id: 'deno', label: 'Deno', exeNames: ['deno.exe'], versionArgs: ['--version'], knownDirs: [`${UP}\\.deno\\bin`], versionManagers: ['scoop'] },
  { id: 'bun', label: 'Bun', exeNames: ['bun.exe'], versionArgs: ['--version'], knownDirs: [`${UP}\\.bun\\bin`], versionManagers: ['scoop'] },
];

export const RUNTIME_BY_ID: ReadonlyMap<RuntimeId, RuntimeSpec> = new Map(RUNTIME_CATALOG.map((r) => [r.id, r]));

// ---- where an install lives ---------------------------------------------------------------------------

export type DetectionSource = 'path' | 'registry' | 'known-dir' | 'shim';
/** What kind of indirection a location is: the WindowsApps alias directory, or a named version manager. */
export type ShimKind = 'windowsapps' | 'nvm' | 'volta' | 'fnm' | 'pyenv-win' | 'scoop' | 'rustup' | 'asdf';

const SHIM_PATTERNS: readonly { readonly kind: ShimKind; readonly re: RegExp }[] = [
  { kind: 'windowsapps', re: /\\microsoft\\windowsapps(?:\\|$)/i },
  { kind: 'nvm', re: /\\nvm(?:\\|$)|\\nvm4w(?:\\|$)|\\nodejs-symlink(?:\\|$)/i },
  { kind: 'volta', re: /\\\.volta\\bin(?:\\|$)|\\volta\\bin(?:\\|$)/i },
  { kind: 'fnm', re: /\\fnm_multishells\\|\\fnm(?:\\|$)/i },
  { kind: 'pyenv-win', re: /\\\.pyenv\\pyenv-win\\(?:shims|bin)(?:\\|$)/i },
  { kind: 'scoop', re: /\\scoop\\shims(?:\\|$)/i },
  { kind: 'rustup', re: /\\\.cargo\\bin(?:\\|$)|\\\.rustup\\/i },
  { kind: 'asdf', re: /\\\.asdf\\shims(?:\\|$)/i },
];

/** Classifies a directory as a WindowsApps alias dir or a version-manager shim/symlink dir; undefined for a plain install. */
export function classifyLocation(dir: string): ShimKind | undefined {
  const d = dir.replace(/\//g, '\\');
  return SHIM_PATTERNS.find((p) => p.re.test(d))?.kind;
}

export interface Detection {
  readonly id: RuntimeId;
  readonly label: string;
  /** Executable path, or the install directory for registry-only entries. */
  readonly path: string;
  /** Set when `path` is a runnable executable that a version probe could execute. */
  readonly exe?: string;
  readonly source: DetectionSource;
  /** Static version (file version resource or registry), not from running the program. */
  readonly version?: string;
  /** Version parsed from a live probe, after the explicit Run action. */
  readonly liveVersion?: string;
  readonly onPath: boolean;
  /** Position in the effective PATH order (0 wins) when `onPath`. */
  readonly pathIndex?: number;
  readonly shim?: ShimKind;
  readonly note?: string;
}

/** Removes repeats of the same install (same id and path; registry-only rows also by version), keeping the richest row. */
export function dedupeByPath(detections: readonly Detection[]): Detection[] {
  const seen = new Map<string, Detection>();
  for (const d of detections) {
    const key = `${d.id}|${d.path.toLowerCase().replace(/\\+$/, '')}${d.exe ? '' : `|${d.version ?? ''}`}`;
    const prev = seen.get(key);
    if (!prev) { seen.set(key, d); continue; }
    seen.set(key, {
      ...prev,
      version: prev.version ?? d.version,
      onPath: prev.onPath || d.onPath,
      pathIndex: prev.pathIndex ?? d.pathIndex,
      shim: prev.shim ?? d.shim,
      source: prev.onPath || !d.onPath ? prev.source : d.source,
    });
  }
  return [...seen.values()];
}

// ---- version parsing ------------------------------------------------------------------------------------

const SEMVER = /\d+\.\d+(?:\.\d+)*(?:[-+][0-9A-Za-z.-]+)?/;

const VERSION_PATTERNS: Partial<Record<RuntimeId, RegExp>> = {
  git: /git version (\S+)/i,
  node: /v?(\d+\.\d+\.\d+\S*)/,
  python: /Python (\d+\.\d+(?:\.\d+)?\S*)/i,
  java: /(?:openjdk|java) version "([^"]+)"|(?:openjdk|java) (\d+(?:\.\d+)*)/i,
  docker: /Docker version ([^,\s]+)/i,
  pwsh: /PowerShell (\d+\.\d+\.\d+\S*)/i,
  go: /go version go(\S+)/i,
  rustc: /rustc (\S+)/i,
  cargo: /cargo (\S+)/i,
  ruby: /ruby (\d+\.\d+\.\d+\S*)/i,
  php: /PHP (\d+\.\d+\.\d+\S*)/i,
  deno: /deno (\d+\.\d+\.\d+\S*)/i,
};

/** Extracts a version from a version-flag run. Java prints to stderr, so its stderr is searched first. */
export function parseVersionOutput(id: RuntimeId, stdout: string, stderr = ''): string | undefined {
  const text = id === 'java' ? `${stderr}\n${stdout}` : `${stdout}\n${stderr}`;
  const pattern = VERSION_PATTERNS[id];
  if (pattern) {
    const m = pattern.exec(text);
    if (m) return m.slice(1).find((g) => g !== undefined);
  }
  return SEMVER.exec(text)?.[0];
}

/** Tidies a PE version string ("2.47.0.windows.2", "22.11.0.0") to dotted numbers. */
export function normalizeStaticVersion(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const m = /\d+(?:\.\d+){1,3}/.exec(value);
  if (!m) return undefined;
  const parts = m[0].split('.');
  if (parts.length === 4 && parts[3] === '0') parts.pop();
  return parts.join('.');
}

// ---- conflicts ----------------------------------------------------------------------------------------------

export type ConflictKind = 'multiple-versions' | 'multiple-locations' | 'java-home-mismatch' | 'alias-shadow';

export interface RuntimeConflict {
  readonly id: string;
  readonly runtime: RuntimeId;
  readonly kind: ConflictKind;
  readonly severity: 'warn' | 'info';
  readonly title: string;
  readonly detail: string;
  readonly paths: readonly string[];
}

export interface ConflictEnv { readonly javaHome?: string }

const versionOf = (d: Detection): string | undefined => d.liveVersion ?? d.version;
const dirOf = (path: string): string => path.replace(/\\[^\\]*$/, '');
const norm = (path: string): string => path.toLowerCase().replace(/\\+$/, '');

/**
 * The Runtime Version Conflict Detector: runtimes with several distinct versions or locations on PATH
 * (the earliest wins), a JAVA_HOME that disagrees with the java PATH runs, and a WindowsApps alias
 * shadowing (or shadowed by) a real install.
 */
export function findConflicts(detections: readonly Detection[], env: ConflictEnv = {}): RuntimeConflict[] {
  const out: RuntimeConflict[] = [];
  const unique = dedupeByPath(detections);
  const ids = [...new Set(unique.map((d) => d.id))];

  for (const id of ids) {
    const spec = RUNTIME_BY_ID.get(id);
    const label = spec?.label ?? id;
    const mine = unique.filter((d) => d.id === id);
    const onPath = mine.filter((d) => d.onPath && d.exe).sort((a, b) => (a.pathIndex ?? 0) - (b.pathIndex ?? 0));

    if (onPath.length > 1) {
      const versions = new Set(onPath.map(versionOf).filter((v): v is string => !!v));
      const dirs = new Set(onPath.map((d) => norm(dirOf(d.path))));
      if (dirs.size > 1) {
        const winner = onPath[0];
        const differ = versions.size > 1;
        out.push({
          id: `${id}-multiple`, runtime: id, kind: differ ? 'multiple-versions' : 'multiple-locations', severity: differ ? 'warn' : 'info',
          title: differ ? `${label}: ${versions.size} different versions on PATH` : `${label}: ${dirs.size} copies on PATH`,
          detail: `${winner.path}${versionOf(winner) ? ` (${versionOf(winner)})` : ''} runs first. Also: ${onPath.slice(1).map((d) => `${d.path}${versionOf(d) ? ` (${versionOf(d)})` : ''}`).join('; ')}`,
          paths: onPath.map((d) => d.path),
        });
      }
    }

    const aliases = mine.filter((d) => d.shim === 'windowsapps');
    const real = mine.filter((d) => d.shim !== 'windowsapps' && (d.exe || d.source === 'registry'));
    if (aliases.length && real.length) {
      const aliasWins = aliases.some((a) => a.onPath && onPath[0] === a);
      const alias = aliases[0];
      out.push({
        id: `${id}-alias`, runtime: id, kind: 'alias-shadow', severity: aliasWins ? 'warn' : 'info',
        title: aliasWins ? `${label}: a WindowsApps alias runs before the real install` : `${label}: a WindowsApps alias is on PATH behind the real install`,
        detail: aliasWins
          ? `${alias.path} is an App Execution Alias (often a Store installer stub) and wins over ${real[0].path}. Turn the alias off in Settings > Apps > Advanced app settings > App execution aliases, or move the real install ahead of it.`
          : `${alias.path} is an App Execution Alias; ${real[0].path} currently wins.`,
        paths: [alias.path, ...real.map((r) => r.path)],
      });
    }
  }

  if (env.javaHome) {
    const home = norm(env.javaHome);
    const javas = unique.filter((d) => d.id === 'java' && d.onPath && d.exe).sort((a, b) => (a.pathIndex ?? 0) - (b.pathIndex ?? 0));
    const winner = javas[0];
    if (winner && norm(dirOf(dirOf(winner.path))) !== home && !winner.shim) {
      out.push({
        id: 'java-home-mismatch', runtime: 'java', kind: 'java-home-mismatch', severity: 'warn',
        title: 'JAVA_HOME does not match the java that PATH runs',
        detail: `JAVA_HOME is ${env.javaHome}, but the first java on PATH is ${winner.path}. Build tools use JAVA_HOME; a shell running "java" uses PATH.`,
        paths: [env.javaHome, winner.path],
      });
    }
  }
  return out;
}

// ---- probe commands ---------------------------------------------------------------------------------------------

export interface ProbePlanItem { readonly key: string; readonly runtime: RuntimeId; readonly exe: string; readonly args: readonly string[]; readonly display: string }

const quoteArg = (s: string): string => (/\s/.test(s) ? `"${s}"` : s);

/** The exact executions a "Run version probes" action would perform: one per distinct runnable .exe. */
export function buildProbePlan(detections: readonly Detection[]): ProbePlanItem[] {
  const seen = new Set<string>();
  const out: ProbePlanItem[] = [];
  for (const d of detections) {
    if (!d.exe || !/\.exe$/i.test(d.exe)) continue;
    const key = d.exe.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const args = RUNTIME_BY_ID.get(d.id)?.versionArgs ?? ['--version'];
    out.push({ key: `${d.id}:${out.length}`, runtime: d.id, exe: d.exe, args, display: [quoteArg(d.exe), ...args].join(' ') });
  }
  return out;
}
