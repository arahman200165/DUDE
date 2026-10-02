import { TestBed } from '@angular/core/testing';
import { LlmProxyService } from './llm-proxy.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from './testing/fake-electron-bridge';

describe('LlmProxyService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
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
    const service = withBridge({ isConfigured: async () => false, chat: async () => ({ ok: false, error: 'not-configured' }) });
    await expect(service.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/Configure an LLM provider/);
  });

  it('calls the bridge and returns the assistant content', async () => {
    const chat = vi.fn(async () => ({ ok: true as const, content: 'hello there' }));
    const service = withBridge({ isConfigured: async () => true, chat });

    expect(await service.chat([{ role: 'user', content: 'hi' }])).toBe('hello there');
    expect(chat).toHaveBeenCalledWith({ messages: [{ role: 'user', content: 'hi' }] });
  });

  it('throws the bridge error message on failure', async () => {
    const service = withBridge({ isConfigured: async () => true, chat: async () => ({ ok: false, error: 'bad request' }) });
    await expect(service.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/bad request/);
  });
});
