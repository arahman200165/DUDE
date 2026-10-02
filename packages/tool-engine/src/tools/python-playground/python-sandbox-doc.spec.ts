import { buildPythonSandboxDoc } from "./python-sandbox-doc.js";

describe('buildPythonSandboxDoc', () => {
  it('allows loading scripts and fetching from the given origin, not a bare self (which would be a no-op inside an opaque origin)', () => {
    const doc = buildPythonSandboxDoc('https://example.github.io/DUDE/assets/vendor/pyodide/', 'https://example.github.io');
    expect(doc).toContain('connect-src https://example.github.io');
    expect(doc).toContain("script-src 'unsafe-inline' 'wasm-unsafe-eval' https://example.github.io");
    expect(doc).not.toContain("'self'");
  });

  it('allows wasm instantiation and inline scripts, but no worker or unrestricted script-src', () => {
    const doc = buildPythonSandboxDoc('https://x/', 'https://x');
    expect(doc).toContain("'wasm-unsafe-eval'");
    expect(doc).toContain("'unsafe-inline'");
    expect(doc).toContain("worker-src 'none'");
  });

  it('loads pyodide.js from the given directory and passes it as indexURL', () => {
    const doc = buildPythonSandboxDoc('https://x/assets/vendor/pyodide/', 'https://x');
    expect(doc).toContain('"https://x/assets/vendor/pyodide/"');
    expect(doc).toContain("scriptEl.src = PYODIDE_DIR + 'pyodide.js';");
    expect(doc).toContain('loadPyodide({ indexURL: PYODIDE_DIR })');
  });

  it('wires stdout/stderr capture and a run/result/error message protocol', () => {
    const doc = buildPythonSandboxDoc('https://x/', 'https://x');
    expect(doc).toContain('pyodide.setStdout');
    expect(doc).toContain('pyodide.setStderr');
    expect(doc).toContain("data.kind !== 'run'");
    expect(doc).toContain("kind: 'result'");
    expect(doc).toContain("kind: 'error'");
  });
});
