import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { installBridge, recordingFsBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { DirectoryTreeGeneratorTool } from './directory-tree-generator';

describe('Directory Tree Generator — confirmation boundary (DUDE_PRD.md §5.2.1)', () => {
  afterEach(() => removeBridge());

  it('generating never writes; saving into the folder applies only after review and confirm', async () => {
    const { bridge, calls } = recordingFsBridge({ jobItems: () => [{ path: 'src', kind: 'dir', size: 0, mtimeMs: 0, depth: 0 }, { path: 'src/a.ts', kind: 'file', size: 1, mtimeMs: 0, depth: 1 }] });
    installBridge(bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(DirectoryTreeGeneratorTool);
    (fixture.componentInstance as unknown as { root: { set(value: string): void } }).root.set('C:\work');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (selector: string) => { (element.querySelector(selector) as HTMLElement).click(); await settleFsJobs(fixture); };

    await click('[data-testid="fs-scan"]');
    expect(element.querySelector('[data-testid="tree-output"]')?.textContent).toContain('└── a.ts');
    expect(calls.plansBuilt).toEqual([]);
    await click('[data-testid="plan-preview-button"]');
    expect(calls.plansBuilt).toEqual(['write-text']);
    await click('[data-testid="mutation-review-apply"]');
    expect(calls.applies).toEqual([]);
    await click('[data-testid="mutation-confirm"]');
    expect(calls.applies).toEqual(['plan-1']);
  });
});
