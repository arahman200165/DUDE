import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { SizeAggregator } from '../../../shared-logic/fs/size-aggregate';
import { FolderSizeAnalyzerTool } from './folder-size-analyzer';

function report() {
  const aggregator = new SizeAggregator();
  aggregator.add({ path: 'cache', kind: 'dir', size: 0, mtimeMs: 0, depth: 0 });
  aggregator.add({ path: 'cache/blob.bin', kind: 'file', size: 4096, mtimeMs: 0, depth: 1 });
  return aggregator.finish();
}

describe('Folder Size Analyzer — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('scanning and selecting never delete; the Recycle Bin plan applies only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({ jobResult: () => ({ report: report(), scannedAt: '2026-01-01T00:00:00Z' }) });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(FolderSizeAnalyzerTool);
    const tool = fixture.componentInstance as unknown as { root: { set(value: string): void } };
    tool.root.set('C:\work');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(calls.jobs.map((job) => job.kind)).toEqual(['folder-size']);
    const checkbox = element.querySelector('input[aria-label="Select cache"]') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    await settleFsJobs(fixture);
    await click('[data-testid="plan-preview-button"]');
    expect(calls.plansBuilt).toEqual(['trash']);
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
