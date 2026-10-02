import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SysJournalEntry } from "@dude/contracts/system/sys-mutation-types";
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { recordingSysBridge } from '../../core/platform/testing/recording-sys-bridge';
import { SystemChangesTool } from './system-changes';

const entry: SysJournalEntry = {
  planId: 'applied-1', title: 'Set FOO', tool: 'env-editor', appliedAt: '2026-09-01T10:00:00.000Z', elevated: false,
  ops: [{ kind: 'env.set', target: 'HKCU\\Environment\\FOO', summary: 'Set', outcome: 'applied', noUndo: false, before: '(unset)', after: 'bar', undo: { kind: 'env.remove', params: { name: 'FOO' } } }],
  backupBytes: 0, backupsPruned: false,
};

describe('System Changes — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  function render(options: Parameters<typeof recordingSysBridge>[0] = {}) {
    const { bridge, calls } = recordingSysBridge({ journalEntries: [entry], ...options });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(SystemChangesTool);
    const element = fixture.nativeElement as HTMLElement;
    const click = async (testId: string) => {
      (element.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
      await settleFsJobs(fixture);
    };
    return { fixture, element, click, calls };
  }

  it('loading the journal and opening an entry never applies', async () => {
    const { fixture, element, click, calls } = render();
    await settleFsJobs(fixture);
    expect(element.textContent).toContain('Set FOO');
    await click('journal-toggle');
    expect(element.textContent).toContain('HKCU\\Environment\\FOO');
    expect(calls.applies).toEqual([]);
    expect(calls.tokens).toEqual([]);
  });

  it('previewing an undo builds a plan but changes nothing until review and confirm', async () => {
    const { fixture, element, click, calls } = render();
    await settleFsJobs(fixture);
    await click('undo-preview');
    expect(calls.undoPlans).toEqual(['applied-1']);
    expect(calls.applies).toEqual([]);

    await click('system-change-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);

    await click('system-change-confirm');
    expect(calls.tokens).toEqual([{ planId: 'sys-plan-1', typed: [] }]);
    expect(calls.applies).toEqual([{ planId: 'sys-plan-1', token: 'token-sys-plan-1', acceptNoUndo: false }]);
    expect(element.textContent).toContain('1 applied');
  });

  it('a stale or rejected token surfaces an error and nothing is applied', async () => {
    const { fixture, element, click, calls } = render({ tokenError: 'The preview expired; preview again.' });
    await settleFsJobs(fixture);
    await click('undo-preview');
    await click('system-change-review-apply');
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toEqual([]);
    expect(element.textContent).toContain('The preview expired');
  });
});
