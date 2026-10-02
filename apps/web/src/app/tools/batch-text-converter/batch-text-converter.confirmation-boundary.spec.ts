import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { FsJobRequest } from "@dude/contracts/fs/fs-types";
import { fakePlanPreview, installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { BatchTextConverterTool } from './batch-text-converter';

describe('Batch Text Converter — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('inventorying never writes; the conversion applies only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({
      jobItems: (request: FsJobRequest) => (request.kind === 'text-inventory' ? [{ path: 'a.txt', size: 4, encoding: 'utf8', bom: false, eol: 'crlf', finalNewline: true, trailingWhitespaceLines: 0, indent: 'none' }] : []),
      jobResult: (request: FsJobRequest) => (request.kind === 'plan-convert' ? { preview: fakePlanPreview() } : { files: 1, binary: 0 }),
    });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(BatchTextConverterTool);
    (fixture.componentInstance as unknown as { root: { set(value: string): void } }).root.set('C:\work');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(element.textContent).toContain('CRLF 1');
    await click('[data-testid="plan-preview-button"]');
    expect(calls.jobs.map((job) => job.kind)).toEqual(['text-inventory', 'plan-convert']);
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
