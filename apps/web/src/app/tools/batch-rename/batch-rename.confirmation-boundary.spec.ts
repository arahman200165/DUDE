import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FsJobRequest } from "@dude/contracts/fs/fs-types";
import { fakePlanPreview, installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { BatchRenameTool } from './batch-rename';

describe('Batch Rename — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('loading and live preview never rename; the plan applies only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({
      jobItems: (request: FsJobRequest) => (request.kind === 'walk' ? [{ path: 'IMG_1.jpg', kind: 'file', size: 1, mtimeMs: 0, depth: 0 }, { path: 'CON.jpg', kind: 'file', size: 1, mtimeMs: 0, depth: 0 }] : []),
      jobResult: (request: FsJobRequest) => (request.kind === 'plan-rename' ? { preview: fakePlanPreview() } : {}),
    });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BatchRenameTool);
    const tool = fixture.componentInstance as unknown as { root: { set(value: string): void }; rename: { set(value: unknown): void } };
    tool.root.set('C:\work');
    tool.rename.set({ mode: 'pattern', find: 'IMG_', replace: 'photo-', regex: false, caseSensitive: false, target: 'name', caseTransform: 'none', template: '{name}{.ext}', counterStart: 1, counterStep: 1, sort: 'path', list: '' });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(element.textContent).toContain('1 to rename');
    await click('[data-testid="plan-preview-button"]');
    const planRequest = calls.jobs.find((job) => job.kind === 'plan-rename')!;
    expect((planRequest.params as { paths: string[] }).paths).toEqual(['IMG_1.jpg']);
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
