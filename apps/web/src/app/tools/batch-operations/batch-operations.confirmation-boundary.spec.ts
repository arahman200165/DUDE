import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { JournalEntry } from "@dude/contracts/fs/fs-types";
import { recordingFsBridge, installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { BatchOperationsTool } from './batch-operations';

const entry: JournalEntry = {
  planId: 'applied-1', title: 'Rename photos', tool: 'batch-rename', root: 'C:\\work', appliedAt: '2026-09-01T10:00:00.000Z',
  ops: [{ kind: 'rename', path: 'a.jpg', to: 'b.jpg', outcome: 'applied', after: { size: 1, mtimeMs: 1 } }],
  backupBytes: 0, backupsPruned: false, noUndo: false,
};

describe('Batch Operations — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('previewing an undo builds a plan but changes nothing until review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge();
    (bridge.fsMutation as { journal: unknown }).journal = async () => ({ ok: true, value: [entry] });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BatchOperationsTool);
    await settleFsJobs(fixture);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Rename photos');

    (element.querySelector('[data-testid="undo-preview"]') as HTMLButtonElement).click();
    await settleFsJobs(fixture);
    expect(calls.plansBuilt).toEqual(['undo']);
    expect(calls.applies).toEqual([]);

    (element.querySelector('[data-testid="mutation-review-apply"]') as HTMLButtonElement).click();
    await settleFsJobs(fixture);
    expect(calls.applies).toEqual([]);

    (element.querySelector('[data-testid="mutation-confirm"]') as HTMLButtonElement).click();
    await settleFsJobs(fixture);
    expect(calls.tokens).toEqual(['plan-1']);
    expect(calls.applies).toEqual(['plan-1']);
  });
});
