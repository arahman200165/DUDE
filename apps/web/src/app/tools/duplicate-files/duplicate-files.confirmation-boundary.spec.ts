import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { DuplicateFilesTool } from './duplicate-files';

const groups = [{ key: '4:abc', size: 4, wasted: 4, identicalBytes: true, files: [{ path: 'a.txt', size: 4, mtimeMs: 1 }, { path: 'copy/a.txt', size: 4, mtimeMs: 2 }] }];

describe('Duplicate Files — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('finding and selecting never delete; recycling applies only after review and confirm, and never every copy', async () => {
    const { bridge, calls } = recordingFsBridge({ jobResult: () => ({ mode: 'exact', scannedFiles: 2, groups, duplicateFiles: 1, wasted: 4 }) });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DuplicateFilesTool);
    (fixture.componentInstance as unknown as { root: { set(value: string): void } }).root.set('C:\work');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };
    const check = async (label: string) => { const box = element.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement; box.checked = true; box.dispatchEvent(new Event('change')); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(calls.jobs.map((job) => job.kind)).toEqual(['duplicates']);
    // Selecting both copies is refused before any plan is built.
    await check('Select a.txt');
    await check('Select copy/a.txt');
    expect((element.querySelector('[data-testid="plan-preview-button"]') as HTMLButtonElement).disabled).toBe(true);
    expect(element.textContent).toContain('keep at least one');

    await click('[data-testid="apply-rule"]');
    await click('[data-testid="plan-preview-button"]');
    expect(calls.plansBuilt).toEqual(['trash']);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
