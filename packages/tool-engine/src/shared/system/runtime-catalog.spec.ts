import {
  RUNTIME_CATALOG, buildProbePlan, classifyLocation, dedupeByPath, findConflicts, normalizeStaticVersion, parseVersionOutput,
  type Detection,
} from "./runtime-catalog.js";

const det = (over: Partial<Detection> & Pick<Detection, 'id' | 'path'>): Detection => ({
  label: over.id, source: 'path', onPath: true, exe: over.path, ...over,
});

describe('runtime catalog', () => {
  it('covers the required runtimes with unique ids and version args', () => {
    const ids = RUNTIME_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ['git', 'node', 'npm', 'pnpm', 'yarn', 'python', 'java', 'dotnet', 'docker', 'pwsh', 'go', 'rustc', 'cargo', 'ruby', 'php', 'deno', 'bun']) expect(ids).toContain(id);
    expect(RUNTIME_CATALOG.find((r) => r.id === 'java')).toMatchObject({ versionArgs: ['-version'], versionStream: 'stderr' });
  });
});

describe('parseVersionOutput', () => {
  it('parses each runtime format', () => {
    expect(parseVersionOutput('node', 'v22.11.0\n', '')).toBe('22.11.0');
    expect(parseVersionOutput('python', 'Python 3.12.4\n', '')).toBe('3.12.4');
    expect(parseVersionOutput('go', 'go version go1.22.3 windows/amd64', '')).toBe('1.22.3');
    expect(parseVersionOutput('dotnet', '8.0.100\r\n', '')).toBe('8.0.100');
    expect(parseVersionOutput('git', 'git version 2.47.0.windows.2', '')).toBe('2.47.0.windows.2');
    expect(parseVersionOutput('docker', 'Docker version 27.1.1, build 6312585', '')).toBe('27.1.1');
    expect(parseVersionOutput('pwsh', 'PowerShell 7.4.5', '')).toBe('7.4.5');
    expect(parseVersionOutput('rustc', 'rustc 1.79.0 (129f3b996 2024-06-10)', '')).toBe('1.79.0');
  });

  it('reads java from stderr', () => {
    const err = 'openjdk version "21.0.3" 2024-04-16 LTS\nOpenJDK Runtime Environment Temurin-21.0.3+9 (build 21.0.3+9-LTS)';
    expect(parseVersionOutput('java', '', err)).toBe('21.0.3');
    expect(parseVersionOutput('java', '', 'java version "1.8.0_401"')).toBe('1.8.0_401');
  });

  it('falls back to the first version-like token and returns undefined otherwise', () => {
    expect(parseVersionOutput('bun', '1.1.20', '')).toBe('1.1.20');
    expect(parseVersionOutput('node', 'not found', '')).toBeUndefined();
  });

  it('never throws on arbitrary text', () => {
    for (const s of ['', '\u0000', 'x'.repeat(10000), '"""', 'v', 'Python ']) expect(() => parseVersionOutput('java', s, s)).not.toThrow();
  });
});

describe('helpers', () => {
  it('normalizes static file versions', () => {
    expect(normalizeStaticVersion('22.11.0.0')).toBe('22.11.0');
    expect(normalizeStaticVersion('2.47.0.windows.2')).toBe('2.47.0');
    expect(normalizeStaticVersion('3.12.4150.1013')).toBe('3.12.4150.1013');
    expect(normalizeStaticVersion('')).toBeUndefined();
  });

  it('classifies WindowsApps and version-manager locations', () => {
    expect(classifyLocation('C:\\Users\\me\\AppData\\Local\\Microsoft\\WindowsApps')).toBe('windowsapps');
    expect(classifyLocation('C:\\Users\\me\\AppData\\Roaming\\nvm')).toBe('nvm');
    expect(classifyLocation('C:\\Users\\me\\.pyenv\\pyenv-win\\shims')).toBe('pyenv-win');
    expect(classifyLocation('C:\\Users\\me\\scoop\\shims')).toBe('scoop');
    expect(classifyLocation('C:\\Program Files\\nodejs')).toBeUndefined();
  });

  it('dedupes by id and path, merging PATH info', () => {
    const out = dedupeByPath([
      det({ id: 'node', path: 'C:\\n\\node.exe', onPath: false, source: 'known-dir', version: '22.0.0' }),
      det({ id: 'node', path: 'c:\\N\\node.exe', onPath: true, pathIndex: 3 }),
      det({ id: 'node', path: 'C:\\other\\node.exe' }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ onPath: true, pathIndex: 3, version: '22.0.0' });
  });

  it('plans one probe per distinct .exe and skips .cmd shims', () => {
    const plan = buildProbePlan([
      det({ id: 'node', path: 'C:\\Program Files\\nodejs\\node.exe' }),
      det({ id: 'node', path: 'c:\\program files\\nodejs\\node.exe' }),
      det({ id: 'npm', path: 'C:\\Program Files\\nodejs\\npm.cmd' }),
      det({ id: 'java', path: 'C:\\j\\bin\\java.exe' }),
      det({ id: 'dotnet', path: 'C:\\dotnet', exe: undefined, source: 'registry', onPath: false }),
    ]);
    expect(plan.map((p) => p.display)).toEqual(['"C:\\Program Files\\nodejs\\node.exe" --version', 'C:\\j\\bin\\java.exe -version']);
  });
});

describe('findConflicts', () => {
  it('flags multiple versions on PATH and names the winner', () => {
    const c = findConflicts([
      det({ id: 'node', path: 'C:\\a\\node.exe', pathIndex: 4, version: '18.0.0' }),
      det({ id: 'node', path: 'C:\\b\\node.exe', pathIndex: 2, version: '22.0.0' }),
    ]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: 'multiple-versions', severity: 'warn' });
    expect(c[0].detail.startsWith('C:\\b\\node.exe')).toBe(true);
  });

  it('reports same-version copies as info and nothing for a single install', () => {
    const same = findConflicts([
      det({ id: 'git', path: 'C:\\a\\git.exe', pathIndex: 0, version: '2.4.0' }),
      det({ id: 'git', path: 'C:\\b\\git.exe', pathIndex: 1, version: '2.4.0' }),
    ]);
    expect(same[0]).toMatchObject({ kind: 'multiple-locations', severity: 'info' });
    expect(findConflicts([det({ id: 'git', path: 'C:\\a\\git.exe', pathIndex: 0 })])).toEqual([]);
  });

  it('flags a WindowsApps alias that wins over a real install', () => {
    const c = findConflicts([
      det({ id: 'python', path: 'C:\\U\\WindowsApps\\python.exe', pathIndex: 0, shim: 'windowsapps' }),
      det({ id: 'python', path: 'C:\\Python312\\python.exe', pathIndex: 5, version: '3.12.0' }),
    ]);
    expect(c.find((x) => x.kind === 'alias-shadow')).toMatchObject({ severity: 'warn' });
  });

  it('flags a JAVA_HOME that disagrees with PATH', () => {
    const java = det({ id: 'java', path: 'C:\\jdk17\\bin\\java.exe', pathIndex: 1 });
    expect(findConflicts([java], { javaHome: 'C:\\jdk21' }).map((c) => c.kind)).toEqual(['java-home-mismatch']);
    expect(findConflicts([java], { javaHome: 'c:\\JDK17\\' })).toEqual([]);
  });
});
