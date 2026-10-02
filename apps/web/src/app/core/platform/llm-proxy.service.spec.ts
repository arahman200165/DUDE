import { TestBed } from '@angular/core/testing';
import { LlmProxyService } from './llm-proxy.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('LlmProxyService', () => {
  const originalDude = window.dude;
  const originalFetch = window.fetch;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
    window.fetch = originalFetch;
  });

  function withBridge(llm: PlatformBridge['llm']): LlmProxyService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ llm }), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(LlmProxyService);
  }

  it('reports not configured on web', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(LlmProxyService);
    expect(await service.isConfigured()).toBe(false);
  });

  it('throws a friendly error on web when chat is called', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(LlmProxyService);
    await expect(service.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/desktop app/);
  });

  it('throws a friendly error when no key is configured', async () => {
    const service = withBridge({ isConfigured: async () => false, getEndpoint: async () => ({ ok: false, error: 'not-configured' }) });
    await expect(service.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Configure an LLM provider/);
  });

  it('fetches the local proxy and returns the assistant content', async () => {
    const service = withBridge({ isConfigured: async () => true, getEndpoint: async () => ({ ok: true, port: 4321 }) });

    let calledUrl = '';
    window.fetch = vi.fn(async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'hello there' } }] }), { status: 200 });
    }) as typeof fetch;

    expect(await service.chat([{ role: 'user', content: 'hi' }])).toBe('hello there');
    expect(calledUrl).toBe('http://127.0.0.1:4321/v1/chat');
  });

  it('throws the upstream error message on a non-ok response', async () => {
    const service = withBridge({ isConfigured: async () => true, getEndpoint: async () => ({ ok: true, port: 4321 }) });
    window.fetch = vi.fn(async () => new Response(JSON.stringify({ error: 'bad request' }), { status: 400 })) as typeof fetch;

    await expect(service.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/bad request/);
  });
});
