import { TestBed } from '@angular/core/testing';
import { SecretsService } from './secrets.service';
import type { PlatformBridge } from "@dude/contracts/shared/models/platform-bridge.model";
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';

describe('SecretsService', () => {
  const originalDude = window.dude;

  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
  });

  function withBridge(secrets: Partial<PlatformBridge['secrets']>): SecretsService {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ secrets: { ...fakeElectronBridge().secrets, ...secrets } }), configurable: true });
    TestBed.configureTestingModule({});
    return TestBed.inject(SecretsService);
  }

  it('reports not set and refuses writes on web without touching window.dude', async () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({});
    const service = TestBed.inject(SecretsService);

    await expect(service.status('ai.llmApiKey')).resolves.toMatchObject({ isSet: false, hint: null });
    await expect(service.set('ai.llmApiKey', 'x')).resolves.toEqual({ ok: false, error: 'not-supported' });
    await expect(service.remove('ai.llmApiKey')).resolves.toEqual({ ok: false, error: 'not-supported' });
  });

  it('passes status through by purpose and exposes no way to read a value', async () => {
    const purposes: string[] = [];
    const service = withBridge({
      status: async (purpose) => { purposes.push(purpose); return { purpose, isSet: true, hint: '••••abcd', needsReentry: false }; },
    });

    await expect(service.status('ai.llmApiKey')).resolves.toEqual({ purpose: 'ai.llmApiKey', isSet: true, hint: '••••abcd', needsReentry: false });
    expect(purposes).toEqual(['ai.llmApiKey']);
    expect('get' in service).toBe(false);
  });

  it('passes through a set failure and remove', async () => {
    const removed: string[] = [];
    const service = withBridge({
      set: async () => ({ ok: false, error: 'encryption-unavailable' }),
      remove: async (purpose) => { removed.push(purpose); return { ok: true }; },
    });

    await expect(service.set('ai.llmApiKey', 'x')).resolves.toEqual({ ok: false, error: 'encryption-unavailable' });
    await expect(service.remove('ai.llmApiKey')).resolves.toEqual({ ok: true });
    expect(removed).toEqual(['ai.llmApiKey']);
  });
});
