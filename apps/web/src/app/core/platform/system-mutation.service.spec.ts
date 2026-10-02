import { TestBed } from '@angular/core/testing';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { recordingSysBridge } from './testing/recording-sys-bridge';
import { SystemMutationService } from './system-mutation.service';

describe('SystemMutationService', () => {
  afterEach(() => removeBridge());

  it('is unavailable on the web and throws a desktop-only error', async () => {
    removeBridge();
    const service = TestBed.inject(SystemMutationService);
    expect(service.available).toBe(false);
    await expect(service.journal()).rejects.toThrow('only available in the desktop app');
  });

  it('confirmAndApply issues a token with the typed names, then applies with that token', async () => {
    const { bridge, calls } = recordingSysBridge();
    installBridge(bridge);
    const service = TestBed.inject(SystemMutationService);
    const result = await service.confirmAndApply('sys-plan-1', ['explorer.exe'], { acceptNoUndo: true });
    expect(calls.tokens).toEqual([{ planId: 'sys-plan-1', typed: ['explorer.exe'] }]);
    expect(calls.applies).toEqual([{ planId: 'sys-plan-1', token: 'token-sys-plan-1', acceptNoUndo: true }]);
    expect(result.applied).toBe(1);
  });

  it('does not apply when the token is rejected', async () => {
    const { bridge, calls } = recordingSysBridge({ tokenError: 'Typed name mismatch' });
    installBridge(bridge);
    await expect(TestBed.inject(SystemMutationService).confirmAndApply('sys-plan-1', [])).rejects.toThrow('Typed name mismatch');
    expect(calls.applies).toEqual([]);
  });

  it('planning builds a preview without applying', async () => {
    const { bridge, calls } = recordingSysBridge();
    installBridge(bridge);
    const preview = await TestBed.inject(SystemMutationService).plan({ tool: 't', title: 'x', ops: [] });
    expect(preview.planId).toBe('sys-plan-1');
    expect(calls.plans).toHaveLength(1);
    expect(calls.applies).toEqual([]);
  });
});
