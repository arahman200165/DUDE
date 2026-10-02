import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => 'C:/ud', isPackaged: false } }));

import { SYS_READ_METHODS } from '@dude/contracts/system/system-types';
import { requestUserConsent } from './user-consent';

type Reply = { ok: true; data: unknown } | { ok: false; error: string };
const helper = (reply: Reply) => ({
  calls: [] as unknown[][],
  call(method: string, params: unknown, timeout?: number) { this.calls.push([method, params, timeout]); return Promise.resolve(reply); },
});

describe('requestUserConsent', () => {
  it('is never a renderer-callable read method', () => {
    expect(SYS_READ_METHODS as readonly string[]).not.toContain('user-consent');
  });

  it('is unavailable off Windows without touching the helper', async () => {
    const h = helper({ ok: true, data: { verified: true, method: 'hello' } });
    expect(await requestUserConsent('1', 'm', h, 'linux')).toEqual({ status: 'unavailable' });
    expect(h.calls).toEqual([]);
  });

  it('is unavailable when the helper is not installed', async () => {
    expect(await requestUserConsent('1', 'm', helper({ ok: false, error: 'Windows system helper is not installed.' }), 'win32')).toEqual({ status: 'unavailable' });
  });

  it('reports verified only for an explicit verified result from hello or credui', async () => {
    const h = helper({ ok: true, data: { verified: true, method: 'credui' } });
    expect(await requestUserConsent('42', 'msg', h, 'win32')).toEqual({ status: 'verified', method: 'credui' });
    expect(h.calls[0]![0]).toBe('user-consent');
    expect(h.calls[0]![1]).toEqual({ hwnd: '42', message: 'msg' });
    expect(await requestUserConsent('1', 'm', helper({ ok: true, data: { verified: true, method: 'none' } }), 'win32')).toMatchObject({ status: 'denied' });
    expect(await requestUserConsent('1', 'm', helper({ ok: true, data: { verified: 'true', method: 'hello' } }), 'win32')).toMatchObject({ status: 'denied' });
    expect(await requestUserConsent('1', 'm', helper({ ok: true, data: null }), 'win32')).toMatchObject({ status: 'denied' });
  });

  it('carries a safe denial reason', async () => {
    expect(await requestUserConsent('1', 'm', helper({ ok: true, data: { verified: false, method: 'hello', reason: 'canceled' } }), 'win32')).toEqual({ status: 'denied', reason: 'canceled' });
    expect(await requestUserConsent('1', 'm', helper({ ok: true, data: { verified: false, method: 'hello', reason: 'Bad <reason>' } }), 'win32')).toEqual({ status: 'denied', reason: 'not-verified' });
  });

  it('restarts the helper after a timeout', async () => {
    const onTimeout = vi.fn();
    expect(await requestUserConsent('1', 'm', helper({ ok: false, error: 'Windows system helper timed out.' }), 'win32', onTimeout)).toEqual({ status: 'denied', reason: 'timeout' });
    expect(onTimeout).toHaveBeenCalledOnce();
  });
});
