import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PlatformService } from '../../../core/platform/platform.service';
import { OfflineReadinessService } from '../../../core/offline/offline-readiness.service';
import { AssetGroupSummary, CacheActionPlan, CacheInspectorService } from '../../../core/offline/cache-inspector.service';
import { CachePlan } from "@dude/domain/core/offline/offline-map.model";
import { WebCompanionSettings } from './web-companion-settings';

// Confirmation boundary at the UI layer (§5.2.1 pattern, Phase 26 Item 5): the first click only
// shows a preview; nothing is executed or downloaded until a separate, explicit Confirm.

function button(root: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
}

const PYODIDE: AssetGroupSummary = {
  name: 'pyodide',
  label: 'Pyodide (Python/WASM)',
  runtime: 'pyodide',
  installMode: 'lazy',
  totalFiles: 5,
  cachedFiles: 5,
  buildBytes: 13_000_000,
  cachedBytes: 13_000_000,
};
const CLEAR_PLAN: CacheActionPlan = { kind: 'clear-runtime', runtime: 'pyodide', label: PYODIDE.label, files: ['a', 'b'], bytes: 13_000_000 };
const REPAIR_PLAN: CacheActionPlan = { kind: 'repair', cacheNames: ['ngsw:/DUDE/:1:assets:app:cache'], registrations: 1 };
const DOWNLOAD_PLAN: CachePlan = { files: ['x', 'y'], bytes: 300, missingFiles: ['y'], missingBytes: 200 };

describe('WebCompanionSettings', () => {
  let execute: ReturnType<typeof vi.fn>;
  let cache: ReturnType<typeof vi.fn>;

  function create(desktop = false) {
    execute = vi.fn().mockResolvedValue(undefined);
    cache = vi.fn().mockResolvedValue(0);
    TestBed.configureTestingModule({
      providers: [
        { provide: PlatformService, useValue: { isDesktop: () => desktop } },
        {
          provide: OfflineReadinessService,
          useValue: {
            enabled: !desktop,
            progress: signal(null),
            planAll: () => DOWNLOAD_PLAN,
            planCategory: () => DOWNLOAD_PLAN,
            planRuntime: () => DOWNLOAD_PLAN,
            cache,
            cancel: vi.fn(),
          },
        },
        {
          provide: CacheInspectorService,
          useValue: {
            refresh: vi.fn().mockResolvedValue(undefined),
            storage: signal({ usage: 1024, quota: 1024 * 1024, persisted: false }),
            groups: signal([PYODIDE]),
            planClearRuntime: vi.fn(() => CLEAR_PLAN),
            planRepair: vi.fn().mockResolvedValue(REPAIR_PLAN),
            execute,
            requestPersistence: vi.fn().mockResolvedValue(true),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(WebCompanionSettings);
    fixture.detectChanges();
    return fixture;
  }

  it('previews a runtime clear on first click, and executes only on Confirm', async () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    button(root, 'Clear…')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="action-preview"]')?.textContent).toContain('Pyodide');
    expect(execute).not.toHaveBeenCalled();

    button(root, 'Confirm clear')!.click();
    await fixture.whenStable();
    expect(execute).toHaveBeenCalledWith(CLEAR_PLAN);
  });

  it('cancelling a repair preview executes nothing', async () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    button(root, 'Repair installation…')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="action-preview"]')?.textContent).toContain('History are kept');

    button(root, 'Cancel')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="action-preview"]')).toBeNull();
    expect(execute).not.toHaveBeenCalled();
  });

  it('sizes a bulk download before fetching anything', async () => {
    const fixture = create();
    const root = fixture.nativeElement as HTMLElement;

    button(root, 'Cache everything…')!.click();
    fixture.detectChanges();
    expect(root.querySelector('[data-testid="download-preview"]')?.textContent).toContain('200 B');
    expect(cache).not.toHaveBeenCalled();

    button(root, 'Download')!.click();
    await fixture.whenStable();
    expect(cache).toHaveBeenCalledWith(DOWNLOAD_PLAN);
  });

  it('shows only the capability matrix on desktop, with no cache controls', () => {
    const fixture = create(true);
    const root = fixture.nativeElement as HTMLElement;

    expect(root.textContent).toContain('Web capability matrix');
    expect(root.textContent).toContain('Regex Tester');
    expect(button(root, 'Repair installation…')).toBeUndefined();
  });
});
