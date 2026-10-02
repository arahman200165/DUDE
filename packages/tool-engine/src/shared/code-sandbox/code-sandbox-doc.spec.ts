import { buildCodeSandboxDoc, buildConsoleCaptureBootstrap } from "./code-sandbox-doc.js";

describe('buildCodeSandboxDoc', () => {
  it('includes a CSP blocking network access while allowing a blob worker', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('worker-src blob:');
  });

  it('allows eval/new Function inside the worker — needed by consumers like the Template Renderer whose library (EJS) compiles via new Function at runtime', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).toContain("'unsafe-eval'");
  });

  it('never embeds user code — the srcdoc is a fixed bootstrap script', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).not.toContain('{{');
    expect(doc).toContain("window.addEventListener('message'");
  });

  it('wires run/cancel handling and a per-run Worker with a timeout', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).toContain("data.kind === 'run'");
    expect(doc).toContain("data.kind === 'cancel'");
    expect(doc).toContain('new Worker(blobUrl)');
    expect(doc).toContain('setTimeout(function ()');
    expect(doc).toContain('.terminate()');
  });

  it('cancels any prior run before starting a new one, reporting it as terminated', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).toContain("if (active) finish({ kind: 'terminated', requestId: active.requestId, reason: 'cancelled' });");
  });

  it('terminates the worker on a plain result too, not only on error — synchronous-only for V1', () => {
    const doc = buildCodeSandboxDoc();
    expect(doc).toContain("if (data.kind === 'result' || data.kind === 'error') cleanupActive();");
  });
});

describe('buildConsoleCaptureBootstrap', () => {
  it('overrides console methods while still forwarding to the original', () => {
    const script = buildConsoleCaptureBootstrap('1');
    expect(script).toContain('original.apply(console, arguments)');
    expect(script).toContain("parent.postMessage({ kind: 'log'");
  });

  it('interpolates the given requestId expression verbatim', () => {
    const script = buildConsoleCaptureBootstrap('window.__renderCounter');
    expect(script).toContain('var requestId = window.__renderCounter;');
  });

  it('captures uncaught errors and unhandled rejections', () => {
    const script = buildConsoleCaptureBootstrap('1');
    expect(script).toContain("addEventListener('error'");
    expect(script).toContain("addEventListener('unhandledrejection'");
  });
});
