import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FsJobRequest } from "@dude/contracts/fs/fs-types";
import { fakePlanPreview, installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { TreeSearchTool } from './tree-search';

const hit = { path: 'src/app.ts', size: 10, encoding: 'utf8', total: 2, matches: [
  { line: 1, column: 0, length: 3, text: 'old one', textColumn: 0, before: [], after: [] },
  { line: 2, column: 0, length: 3, text: 'old two', textColumn: 0, before: [], after: [] },
] };

describe('Tree Search — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('searching never writes; a replace plan carries skipped hunks and applies only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({
      jobItems: (request: FsJobRequest) => (request.kind === 'tree-search' ? [hit] : []),
      jobResult: (request: FsJobRequest) => (request.kind === 'plan-replace' ? { preview: fakePlanPreview() } : { scanned: 1, filesMatched: 1, total: 2, skippedBinary: 0, skippedLarge: 0, truncated: false }),
    });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(TreeSearchTool);
    const tool = fixture.componentInstance as unknown as { root: { set(value: string): void }; pattern: { set(value: string): void }; mode: { set(value: string): void } };
    tool.mode.set('content');
    tool.root.set('C:\work');
    tool.pattern.set('old');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(element.textContent).toContain('src/app.ts');
    const second = element.querySelector('input[aria-label="Replace at line 2"]') as HTMLInputElement;
    second.checked = false;
    second.dispatchEvent(new Event('change'));
    await settleFsJobs(fixture);

    await click('[data-testid="plan-preview-button"]');
    const planRequest = calls.jobs.find((job) => job.kind === 'plan-replace')!;
    expect((planRequest.params as { skip: string[] }).skip).toEqual(['src/app.ts#2:0']);
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
