import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { fakePlanPreview, recordingFsBridge, installBridge, removeBridge, settleFsJobs } from '../../../core/platform/testing/recording-fs-bridge';
import { MutationPreview } from './mutation-preview';

describe('MutationPreview (confirmation boundary)', () => {
  afterEach(() => removeBridge());

  function render(preview = fakePlanPreview()) {
    const recorded = recordingFsBridge({ preview });
    installBridge(recorded.bridge);
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(MutationPreview);
    fixture.componentRef.setInput('preview', preview);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = async (testId: string) => {
      (element.querySelector(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
      await settleFsJobs(fixture);
    };
    return { fixture, element, click, calls: recorded.calls };
  }

  it('shows every affected path and never applies from the review step alone', async () => {
    const { element, click, calls } = render();
    expect(element.textContent).toContain('Nothing has changed on disk yet');
    expect(element.querySelector('[data-testid="mutation-confirm"]')).toBeNull();
    await click('mutation-review-apply');
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
    expect(element.querySelector('[data-testid="mutation-confirm"]')).not.toBeNull();
  });

  it('applies exactly once, with a fresh token for this plan, only after the explicit confirm', async () => {
    const { element, click, calls } = render();
    await click('mutation-review-apply');
    await click('mutation-confirm');
    expect(calls.tokens).toEqual(['plan-1']);
    expect(calls.applies).toEqual(['plan-1']);
    expect(element.textContent).toContain('Applied 1');
  });

  it('keeps confirm disabled until a no-undo acknowledgement when backups would exceed the cap', async () => {
    const { element, click, calls } = render(fakePlanPreview({ exceedsBackupCap: true }));
    await click('mutation-review-apply');
    const confirm = element.querySelector('[data-testid="mutation-confirm"]') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    confirm.click();
    expect(calls.applies).toEqual([]);
  });
});
