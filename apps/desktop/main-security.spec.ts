import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Regression guard for apps/desktop/AGENTS.md's one rule: contextIsolation: true, nodeIntegration:
// false, and sandbox: true, with no exceptions (DUDE_PRD.md §21 Phase 23 Item 9). A text-based
// check over the real source, not a mocked import -- main.ts pulls in the real 'electron'
// module plus every IPC bridge at module scope, so actually constructing a BrowserWindow here
// would mean mocking the whole module graph for very little extra safety over reading the one
// object literal that matters. Mirrors the regex-extraction style already used by
// scripts/generate-security-doc.mjs for the same "cheap, real check over source text" tradeoff.

describe('BrowserWindow security preferences', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');

  it('never constructs a BrowserWindow without the three required webPreferences flags', () => {
    const webPreferencesBlocks = [...mainSource.matchAll(/webPreferences:\s*\{([^}]*)\}/g)];
    expect(webPreferencesBlocks.length, 'main.ts should construct at least one BrowserWindow').toBeGreaterThan(0);

    for (const [, block] of webPreferencesBlocks) {
      expect(block, 'webPreferences must set contextIsolation: true').toMatch(/contextIsolation:\s*true/);
      expect(block, 'webPreferences must set nodeIntegration: false').toMatch(/nodeIntegration:\s*false/);
      expect(block, 'webPreferences must set sandbox: true').toMatch(/sandbox:\s*true/);
    }
  });
});

// Command-line protocol strings must never become BrowserWindow navigation targets.
describe('navigation boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');

  it('guards all document navigations and denies new windows', () => {
    expect(mainSource).toMatch(/webContents\.on\('will-navigate'/);
    expect(mainSource).toMatch(/isAllowedRendererNavigation\(target, baseUrl\)/);
    expect(mainSource).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  });
});

describe('deep-link argv boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');

  it('queues cold and second-instance arguments for renderer interpretation', () => {
    expect(mainSource).toMatch(/enqueueDeepLinkArguments\(process\.argv\)/);
    expect(mainSource).toMatch(/second-instance[\s\S]*enqueueDeepLinkArguments\(args\)/);
    expect(mainSource).not.toMatch(/loadURL\(args|loadURL\(process\.argv/);
  });
});

// The one route out of the app to the user's browser (Phase 30H.6 saved links). Windows still can't
// be opened from the renderer; this narrow, validated IPC is the only exception.
describe('external link boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
  const preloadSource = readFileSync(resolve(__dirname, 'preload.ts'), 'utf-8');
  const bridgeSource = readFileSync(resolve(__dirname, 'external-link-bridge.ts'), 'utf-8');

  it('registers the handler and keeps denying renderer window opens', () => {
    expect(mainSource).toMatch(/registerExternalLinkHandlers\(window\)/);
    expect(mainSource).toMatch(/setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  });

  it('is the only place that calls shell.openExternal with renderer-supplied input, and validates it first', () => {
    expect(bridgeSource).toMatch(/event\.sender !== window\.webContents/);
    expect(bridgeSource.indexOf('normalizeExternalUrl(url)')).toBeGreaterThan(-1);
    expect(bridgeSource.indexOf('normalizeExternalUrl(url)')).toBeLessThan(bridgeSource.indexOf('shell.openExternal(href)'));
    expect(preloadSource).toMatch(/ipcRenderer\.invoke\('dude:external:open', url\)/);
  });
});

// Native theme sync (Phase 30K): validated in main, accepted only from this window's renderer.
describe('appearance boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
  const preloadSource = readFileSync(resolve(__dirname, 'preload.ts'), 'utf-8');
  const bridgeSource = readFileSync(resolve(__dirname, 'appearance-bridge.ts'), 'utf-8');

  it('registers the handler, checks the sender and validates before touching the window', () => {
    expect(mainSource).toMatch(/registerAppearanceBridge\(window\)/);
    expect(mainSource).toMatch(/backgroundColor: nativeAppearance\.background/);
    expect(bridgeSource).toMatch(/event\.sender !== window\.webContents/);
    expect(bridgeSource.indexOf('parseNativeAppearance(payload)')).toBeLessThan(bridgeSource.indexOf('theme.themeSource = '));
    expect(preloadSource).toMatch(/ipcRenderer\.invoke\('dude:appearance:set', \{ mode, background \}\)/);
  });
});

// The packaged renderer is served from a privileged custom scheme (Phase 31B), not a loopback server.
describe('app protocol boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
  const protocolSource = readFileSync(resolve(__dirname, 'app-protocol.ts'), 'utf-8');

  it('registers the dude-app scheme before ready, without CSP bypass or service workers', () => {
    expect(mainSource).toMatch(/^registerAppSchemePrivileges\(\);/m);
    const privileges = protocolSource.match(/registerSchemesAsPrivileged\(([\s\S]*?)\);/)?.[1] ?? '';
    expect(privileges).toMatch(/scheme: APP_SCHEME/);
    expect(privileges).not.toMatch(/bypassCSP/);
    expect(privileges).not.toMatch(/allowServiceWorkers/);
  });

  it('guards file resolution with resolveWithinRoot and no longer uses a loopback static server', () => {
    expect(protocolSource).toMatch(/resolveWithinRoot\(normalizedRoot, url\.pathname\)/);
    expect(mainSource).not.toMatch(/startStaticServer|static-server/);
    expect(existsSync(resolve(__dirname, 'static-server.ts'))).toBe(false);
  });
});

// The LLM integration is an IPC call (Phase 31B), not a loopback HTTP proxy.
describe('llm boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
  const preloadSource = readFileSync(resolve(__dirname, 'preload.ts'), 'utf-8');
  const bridgeSource = readFileSync(resolve(__dirname, 'llm-bridge.ts'), 'utf-8');

  it('has no loopback LLM proxy server left', () => {
    expect(existsSync(resolve(__dirname, 'llm-proxy-server.ts'))).toBe(false);
    expect(bridgeSource).not.toMatch(/llm-proxy-server|createServer|node:http|getEndpoint/);
    expect(mainSource).not.toMatch(/llm-proxy-server/);
    expect(preloadSource).not.toMatch(/getEndpoint/);
  });

  it('checks the sender and validates the payload before touching the provider', () => {
    expect(mainSource).toMatch(/registerLlmHandlers\(window\)/);
    const handler = bridgeSource.slice(bridgeSource.indexOf("'dude:llm:chat'"));
    expect(handler).toMatch(/event\.sender !== window\.webContents/);
    expect(handler.indexOf('parseChatRequest(payload)')).toBeGreaterThan(handler.indexOf('event.sender !== window.webContents'));
    expect(handler.indexOf('chat(messages)')).toBeGreaterThan(handler.indexOf('parseChatRequest(payload)'));
    expect(preloadSource).toMatch(/ipcRenderer\.invoke\('dude:llm:chat', request\)/);
  });
});

// Secrets (Phase 31B, M622): the renderer can learn status and replace/remove, never read a value.
describe('secrets boundary', () => {
  const read = (name: string): string => readFileSync(resolve(__dirname, name), 'utf-8');
  const preloadSource = read('preload.ts');
  const bridgeSource = read('secrets-bridge.ts');

  it('has no secrets get channel anywhere in apps/desktop and no secrets.get in the preload', () => {
    const sources = readdirSync(__dirname, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .map((file) => readFileSync(resolve(__dirname, file), 'utf-8'));
    for (const source of sources) expect(source).not.toContain('dude:secrets:get');
    expect(preloadSource).not.toMatch(/secrets:\s*\{[^}]*get/);
    expect(preloadSource).toMatch(/dude:secrets:status/);
  });

  it('registers the handlers for the window and the secure-store file is gone from the live code', () => {
    expect(read('main.ts')).toMatch(/registerSecretsHandlers\(window\)/);
    expect(bridgeSource).not.toMatch(/secure-store\.json/);
    expect(bridgeSource.match(/event\.sender|fromWindow\(event\)/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

// Device State Store broker (Phase 31B, M620): renderer to preload to main only, never a port.
describe('device store boundary', () => {
  const mainSource = readFileSync(resolve(__dirname, 'main.ts'), 'utf-8');
  const preloadSource = readFileSync(resolve(__dirname, 'preload.ts'), 'utf-8');
  const bridgeSource = readFileSync(resolve(__dirname, 'device-store/store-bridge.ts'), 'utf-8');

  it('registers the handlers for the window and starts the store before preferences', () => {
    expect(mainSource).toMatch(/registerDeviceStoreHandlers\(window\)/);
    expect(mainSource.indexOf('await startDeviceStore()')).toBeGreaterThan(-1);
    expect(mainSource.indexOf('await startDeviceStore()')).toBeLessThan(mainSource.indexOf('await loadDesktopPreferences()'));
  });

  it('sender-checks every ipcMain handler and listener', () => {
    const registrations = bridgeSource.match(/ipcMain\.(handle|on)\(/g) ?? [];
    expect(registrations.length).toBeGreaterThanOrEqual(9);
    const bodies = bridgeSource.split(/ipcMain\.(?:handle|on)\(/).slice(1);
    for (const body of bodies) {
      // The flush reply listener is registered inside requestRendererFlush and checks the sender in its own body.
      if (body.startsWith("'dude:store:flushed'")) continue;
      expect(body.slice(0, 400)).toMatch(/own\(event\.sender\)/);
    }
    expect(bridgeSource).toMatch(/event\.sender !== window\.webContents \|\| replyId !== id/);
  });

  it('validates renderer payloads before calling the host', () => {
    for (const validator of ['validateKvBatch', 'validateEntityCommit', 'validateEntityBatch', 'validateDisplayName']) {
      expect(bridgeSource.indexOf(validator)).toBeGreaterThan(-1);
    }
  });

  it('keeps ports out of the preload and the renderer-facing contract', () => {
    expect(preloadSource).not.toMatch(/MessagePort|MessageChannel|\.ports\b|postMessage/);
    expect(preloadSource).toMatch(/ipcRenderer\.invoke\('dude:store:hydrate'\)/);
    expect(preloadSource).toMatch(/ipcRenderer\.send\('dude:store:flushed', id\)/);
  });
});
