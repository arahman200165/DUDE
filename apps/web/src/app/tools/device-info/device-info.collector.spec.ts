import { collectBrowserFacts, osFactsToDeviceFacts } from './device-info.collector';

function fakeWindow(overrides: Record<string, unknown> = {}, nav: Record<string, unknown> = {}): Window {
  return {
    navigator: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      platform: 'Win32',
      language: 'en-GB',
      languages: ['en-GB', 'en'],
      cookieEnabled: true,
      hardwareConcurrency: 8,
      maxTouchPoints: 0,
      onLine: true,
      ...nav,
    },
    screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24 },
    innerWidth: 1200,
    innerHeight: 800,
    devicePixelRatio: 1.5,
    isSecureContext: true,
    matchMedia: (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' || query === '(display-mode: standalone)' }),
    ...overrides,
  } as unknown as Window;
}

const byId = (facts: { id: string; value: string }[], id: string) => facts.find((fact) => fact.id === id)?.value;

describe('collectBrowserFacts', () => {
  it('reads display, preference and runtime facts', async () => {
    const facts = await collectBrowserFacts(fakeWindow());
    expect(byId(facts, 'display.screen')).toBe('1920 x 1080');
    expect(byId(facts, 'display.dpr')).toBe('1.5');
    expect(byId(facts, 'display.color-depth')).toBe('24-bit');
    expect(byId(facts, 'display.color-scheme')).toBe('dark');
    expect(byId(facts, 'display.reduced-motion')).toBe('no preference');
    expect(byId(facts, 'runtime.display-mode')).toBe('standalone');
    expect(byId(facts, 'runtime.browser')).toMatch(/^Chrome 120/);
    expect(byId(facts, 'locale.languages')).toBe('en-GB, en');
    expect(byId(facts, 'hardware.cpu-count')).toBe('8');
    expect(byId(facts, 'network.online')).toBe('Yes');
  });

  it('prefers userAgentData and reports optional APIs only when present', async () => {
    const facts = await collectBrowserFacts(fakeWindow({}, {
      userAgentData: { platform: 'Windows', mobile: false, brands: [{ brand: 'Chromium', version: '120' }] },
      deviceMemory: 8,
      connection: { effectiveType: '4g', downlink: 10, rtt: 50, saveData: false },
      storage: { estimate: async () => ({ usage: 1024, quota: 1024 * 1024 }) },
    }));
    expect(byId(facts, 'runtime.platform')).toBe('Windows');
    expect(byId(facts, 'runtime.brands')).toBe('Chromium 120');
    expect(byId(facts, 'hardware.device-memory')).toBe('8 GiB');
    expect(byId(facts, 'network.connection-type')).toBe('4g');
    expect(byId(facts, 'network.storage-quota')).toBe('1 MiB');
  });

  it('degrades when storage and matchMedia throw', async () => {
    const facts = await collectBrowserFacts(fakeWindow({ matchMedia: () => { throw new Error('nope'); } }, {
      storage: { estimate: async () => { throw new Error('denied'); } },
    }));
    expect(byId(facts, 'display.color-scheme')).toBe('no preference');
    expect(facts.some((fact) => fact.id === 'network.storage-usage')).toBe(false);
  });
});

describe('osFactsToDeviceFacts', () => {
  it('maps the desktop OS facts into os and hardware groups', () => {
    const facts = osFactsToDeviceFacts({ platform: 'win32', osName: 'Windows 11 Pro', osRelease: '10.0.26200', arch: 'x64', cpuModel: 'CPU', cpuCount: 8, totalMemoryBytes: 16 * 1024 ** 3 });
    expect(byId(facts, 'os.name')).toBe('Windows 11 Pro');
    expect(byId(facts, 'hardware.total-memory')).toBe('16 GiB');
    expect(facts.filter((fact) => fact.group === 'os')).toHaveLength(4);
  });
});
