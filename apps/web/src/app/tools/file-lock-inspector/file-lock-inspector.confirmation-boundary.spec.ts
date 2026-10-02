import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FileLockHandleScanResult, FileLockListResult } from "@dude/contracts/system/system-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview, recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { FileLockInspectorTool } from './file-lock-inspector';

const PATH = 'C:\\work\\held.txt';
const listing: FileLockListResult = {
  owners: [{ pid: 200, startKey: '777001', name: 'Word', service: '', applicationType: 1, restartable: true, appStatus: 1, sessionId: 1 }],
  rebootReasons: 0, partial: false,
};
const scan: FileLockHandleScanResult = {
  owners: [{ pid: 200, startKey: '777001', name: 'WINWORD.EXE', handle: '0x1A4', path: PATH }],
  partial: true, warning: 'Elevated handle scan reached its 3 second budget; results are partial.',
};

describe('File Lock Inspector - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => removeBridge());

  async function render(options: Parameters<typeof recordingSysBridge>[0] = {}, elevated = false) {
    const { bridge, calls } = recordingSysBridge(options);
    const methods: string[] = [];
    const call = async (method: string) => {
      methods.push(method);
      if (method === 'lock.rmList') return { ok: true, data: listing };
      if (method === 'lock.handleScan') return { ok: true, data: scan };
      return { ok: false, error: 'unexpected ' + method };
    };
    installBridge(fakeElectronBridge({
      ...bridge,
      sys: { ...bridge.sys, call: call as never },
      fs: { ...bridge.fs, pickFile: async () => ({ canceled: false, path: PATH, name: 'held.txt', size: 1 }) },
      elevation: { ...bridge.elevation, status: async () => elevated },
    }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(FileLockInspectorTool);
    const element = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settleFsJobs(fixture);
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const click = async (id: string) => { byId(id).click(); await settleFsJobs(fixture); };
    await click('pick-file');
    return { fixture, element, byId, click, calls, methods };
  }

  const expectNothingChanged = (calls: { plans: unknown[]; tokens: unknown[]; applies: unknown[] }) => {
    expect(calls.plans).toEqual([]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  };

  it('picking, listing and refreshing only read and never plan, issue a token or apply', async () => {
    const { click, element, calls, methods } = await render();
    expect(element.textContent).toContain('Word');
    await click('find-locks');
    await click('find-locks');
    expect(new Set(methods)).toEqual(new Set(['lock.rmList']));
    expectNothingChanged(calls);
  });

  it('shows the elevation banner and disables the handle scan when not elevated', async () => {
    const { byId, element, methods } = await render();
    expect((byId('scan-handles') as HTMLButtonElement).disabled).toBe(true);
    expect(element.textContent).toContain('needs an elevated session');
    expect(methods).not.toContain('lock.handleScan');
  });

  it('an elevated handle scan is read-only, shows handle values and the partial note, and states no force-close', async () => {
    const { click, element, calls, methods } = await render({}, true);
    await click('scan-handles');
    expect(methods).toContain('lock.handleScan');
    expect(element.textContent).toContain('0x1A4');
    expect(byText(element, 'scan-warning')).toContain('partial');
    expect(byText(element, 'no-force-close')).toContain('never force-closes a handle');
    expectNothingChanged(calls);
    expect(element.textContent).not.toMatch(/force[- ]close handle/i);
  });

  it('release actions only plan lock.release with the picked path', async () => {
    const { click, calls } = await render();
    await click('release-graceful');
    await click('release-restart');
    expect(calls.plans.map((p) => p.ops)).toEqual([
      [{ kind: 'lock.release', params: { path: PATH, restartAfter: false } }],
      [{ kind: 'lock.release', params: { path: PATH, restartAfter: true } }],
    ]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('End owner process only plans lock.end-owner with the exact pid and start key', async () => {
    const { click, calls } = await render();
    await click('end-owner-200');
    expect(calls.plans).toHaveLength(1);
    expect(calls.plans[0].tool).toBe('file-lock-inspector');
    expect(calls.plans[0].ops).toEqual([{ kind: 'lock.end-owner', params: { path: PATH, pid: 200, startKey: '777001', name: 'Word' } }]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });

  it('applies only after the review and confirm steps, then refreshes the listing', async () => {
    const { click, element, calls, methods } = await render();
    await click('release-graceful');
    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    const before = methods.length;
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('1 applied');
    expect(methods.length).toBeGreaterThan(before);
  });

  it('a critical owner needs the exact typed name before a token is issued', async () => {
    const preview = fakeSysPlanPreview({ typedConfirm: ['lsass.exe'], noUndo: true });
    const { click, byId, fixture, calls } = await render({ preview });
    await click('end-owner-200');
    await click('system-change-review-apply');
    const confirm = () => byId('system-change-confirm') as HTMLButtonElement;
    byId('system-change-accept-no-undo').click();
    const typed = byId('system-change-typed-0') as unknown as HTMLInputElement;
    typed.value = 'wrong.exe';
    typed.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    expect(confirm().disabled).toBe(true);
    confirm().click();
    await settleFsJobs(fixture);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    typed.value = 'lsass.exe';
    typed.dispatchEvent(new Event('input'));
    await settleFsJobs(fixture);
    await click('system-change-confirm');
    expect(calls.tokens).toEqual([{ planId: preview.planId, typed: ['lsass.exe'] }]);
  });

  it('a stale or rejected token surfaces an error and nothing is applied', async () => {
    const { click, element, calls } = await render({ tokenError: 'The preview expired; preview again.' });
    await click('release-graceful');
    await click('system-change-review-apply');
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toEqual([]);
    expect(element.textContent).toContain('The preview expired');
  });
});

function byText(element: HTMLElement, id: string): string {
  return element.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
}
