import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { vi } from 'vitest';
import { QuickRunList } from './quick-run-list';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
}

const fakeActivatedRoute = { snapshot: { queryParamMap: { get: () => null } } };

// `ApplicationRef.whenStable()` does not reliably wait on the dynamic `import()` calls
// `PipelineStepRegistryService.ensureLoaded()` makes in this test environment -- awaiting the same
// memoized promise directly is what actually settles once every tool's pipeline-step module has
// resolved (the component's own `.then()` was attached first, in its constructor, so it always
// fires before this awaited call returns control here).
async function flush(): Promise<void> {
  await TestBed.inject(PipelineStepRegistryService).ensureLoaded();
}

describe('QuickRunList', () => {
  let router: FakeRouter;

  beforeEach(() => {
    router = new FakeRouter();
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: fakeActivatedRoute },
      ],
    });
  });

  // The first test to trigger PipelineStepRegistryService's ~225-dynamic-import cold load can run
  // well past Vitest's 5000ms default under full-suite resource contention (only the first call
  // pays this cost -- ensureLoaded() memoizes the result, so every other test in this file, and
  // every other spec file that reuses the same warm cache, is fast). A generous margin here is a
  // timing accommodation, not a correctness concern -- isolated runs finish in well under a second.
  it(
    'lists text-accepting pipeline-eligible tools once loaded',
    async () => {
      const fixture = TestBed.createComponent(QuickRunList);
      fixture.detectChanges();
      await flush();
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('Base64 Encoder / Decoder');
    },
    45000,
  );

  it('filters the list by search query', async () => {
    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Base64 Encoder';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Base64 Encoder / Decoder');
    expect(fixture.nativeElement.textContent).not.toContain('JWT Debugger');
  });

  it('runs the selected tool\'s pipeline step and shows the result', async () => {
    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Base64 Encoder';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const toolButton: HTMLButtonElement = fixture.nativeElement.querySelector('li button');
    toolButton.click();
    fixture.detectChanges();

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'aGVsbG8=';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const runButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.trim() === 'Run',
    ) as HTMLButtonElement;
    runButton.click();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('hello');
  });

  it('opens the full tool via ToolLauncherService', async () => {
    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'Base64 Encoder';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const toolButton: HTMLButtonElement = fixture.nativeElement.querySelector('li button');
    toolButton.click();
    fixture.detectChanges();

    const openButton = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.includes('Open full tool'),
    ) as HTMLButtonElement;
    openButton.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/base64');
  });

  it('excludes json-only-accepting generator tools', async () => {
    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    const input: HTMLInputElement = fixture.nativeElement.querySelector('input');
    input.value = 'CUID Generator';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('No matching tools.');
  });

  it('deep-links a tool selection from a ?tool= query param, once the registry is ready', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: { get: () => 'base64' } } },
    });

    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Base64 Encoder / Decoder');
    expect(fixture.nativeElement.querySelector('textarea')).toBeTruthy();
  });

  it('ignores a ?tool= query param for a tool that is not text-eligible', async () => {
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: { get: () => 'cuid-generator' } } },
    });

    const fixture = TestBed.createComponent(QuickRunList);
    fixture.detectChanges();
    await flush();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('textarea')).toBeFalsy();
  });
});
