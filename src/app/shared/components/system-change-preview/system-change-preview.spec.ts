import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { installBridge, removeBridge, settleFsJobs } from '../../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview, recordingSysBridge } from '../../../core/platform/testing/recording-sys-bridge';
import type { SysPlanPreview } from '../../../../shared-logic/system/sys-mutation-types';
import { SystemChangePreview } from './system-change-preview';

describe('SystemChangePreview (confirmation boundary)', () => {
  afterEach(() => removeBridge());

  function render(preview: SysPlanPreview = fakeSysPlanPreview()) {
    const recorded = recordingSysBridge({ preview });
    installBridge(recorded.bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SystemChangePreview);
    fixture.componentRef.setInput('preview', preview);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const query = <T extends HTMLElement>(id: string) => element.querySelector(`[data-testid="${id}"]`) as T | null;
    const click = async (id: string) => { query(id)!.click(); await settleFsJobs(fixture); };
    const type = async (id: string, value: string) => {
      const input = query<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await settleFsJobs(fixture);
    };
    return { fixture, element, query, click, type, calls: recorded.calls };
  }

  it('shows the preview and never applies from the review step alone', async () => {
    const { element, query, click, calls } = render();
    expect(element.textContent).toContain('HKCU\\Environment\\FOO');
    expect(element.textContent).toContain('Nothing has changed on this PC yet');
    expect(query('system-change-confirm')).toBeNull();
    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    expect(query('system-change-confirm')).not.toBeNull();
  });

  it('applies only from the confirm button, with a token for this plan', async () => {
    const { element, click, calls } = render();
    await click('system-change-review-apply');
    await click('system-change-confirm');
    expect(calls.tokens).toEqual([{ planId: 'sys-plan-1', typed: [] }]);
    expect(calls.applies).toEqual([{ planId: 'sys-plan-1', token: 'token-sys-plan-1', acceptNoUndo: false }]);
    expect(element.textContent).toContain('1 applied');
  });

  it('keeps confirm disabled until typed names match (case-insensitive) and no-undo is acknowledged', async () => {
    const plan = fakeSysPlanPreview({
      typedConfirm: ['explorer.exe'], noUndo: true,
      ops: [{ index: 0, kind: 'process.kill', target: 'explorer.exe (PID 4)', summary: 'Terminate', warnings: [], requiresElevation: false, typedConfirm: 'explorer.exe', noUndo: true }],
    });
    const { query, click, type, calls } = render(plan);
    await click('system-change-review-apply');
    const confirm = () => query<HTMLButtonElement>('system-change-confirm')!;
    expect(confirm().disabled).toBe(true);
    confirm().click();
    expect(calls.applies).toEqual([]);

    await type('system-change-typed-0', 'EXPLORER.EXE');
    expect(confirm().disabled).toBe(true);
    await click('system-change-accept-no-undo');
    expect(confirm().disabled).toBe(false);

    await type('system-change-typed-0', 'explorer');
    expect(confirm().disabled).toBe(true);
    await type('system-change-typed-0', 'explorer.exe');
    await click('system-change-confirm');
    expect(calls.tokens).toEqual([{ planId: 'sys-plan-1', typed: ['explorer.exe'] }]);
    expect(calls.applies[0].acceptNoUndo).toBe(true);
  });

  it('a blocked plan cannot reach the confirm step', async () => {
    const plan = fakeSysPlanPreview({
      blocked: [{ index: 0, reason: 'Requires an elevated session' }],
      ops: [{ index: 0, kind: 'service.stop', target: 'Spooler', summary: 'Stop', warnings: [], requiresElevation: true, noUndo: false }],
    });
    const { element, query, calls } = render(plan);
    expect(element.textContent).toContain('Requires an elevated session');
    expect(query<HTMLButtonElement>('system-change-review-apply')!.disabled).toBe(true);
    query('system-change-review-apply')!.click();
    expect(query('system-change-confirm')).toBeNull();
    expect(calls.applies).toEqual([]);
  });

  it('discard calls the bridge and emits discarded', async () => {
    const { fixture, click, calls } = render();
    let emitted = 0;
    fixture.componentInstance.discarded.subscribe(() => emitted++);
    await click('system-change-discard');
    expect(calls.discards).toEqual(['sys-plan-1']);
    expect(emitted).toBe(1);
  });
});
