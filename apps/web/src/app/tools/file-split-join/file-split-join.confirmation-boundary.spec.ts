import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FsJobRequest } from "@dude/contracts/fs/fs-types";
import { fakePlanPreview, installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { FileSplitJoinTool } from './file-split-join';

describe('File Split & Join — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('split and join plans are built for review and applied only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({
      jobResult: (request: FsJobRequest) => (request.kind === 'detect-parts'
        ? { sets: [{ base: 'a.bin', naming: 'numeric', parts: ['a.bin.001', 'a.bin.002'], gaps: [], total: 2, sidecar: true }] }
        : { preview: fakePlanPreview() }),
    });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(FileSplitJoinTool);
    const tool = fixture.componentInstance as unknown as { source: { set(v: string): void }; splitOutput: { set(v: string): void }; tab: { set(v: string): void }; partsFolder: { set(v: string): void } };
    tool.tab.set('split');
    tool.source.set('C:\work\a.bin');
    tool.splitOutput.set('C:\out');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="plan-preview-button"]');
    expect(calls.jobs.map((job) => job.kind)).toEqual(['plan-split']);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);

    tool.tab.set('join');
    tool.partsFolder.set('C:\out');
    fixture.detectChanges();
    await click('[data-testid="fs-scan"]');
    await click('[data-testid="plan-preview-button"]');
    expect(calls.jobs.map((job) => job.kind)).toEqual(['plan-split', 'detect-parts', 'plan-join']);
    expect(calls.applies).toEqual(['plan-1']);
  });
});
