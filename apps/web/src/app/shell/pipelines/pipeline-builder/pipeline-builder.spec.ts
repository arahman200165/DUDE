import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from '../../../core/routing/app.routes';
import { PipelineStoreService } from '../../../core/pipeline/pipeline-store.service';
import { PipelineRunnerService } from '../../../core/pipeline/pipeline-runner.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { Pipeline, createPipeline, createToolStep } from "@dude/domain/core/pipeline/pipeline.model";
import { RemoteChangesService } from '../../../core/sync/remote-changes.service';
import { PipelineBuilder } from './pipeline-builder';

describe('pipeline run deep-link confirmation boundary', () => {
  afterEach(() => TestBed.inject(OverlayContainer).ngOnDestroy());

  it('does not execute a linked pipeline until the user clicks Run in its preview', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideServiceWorker('ngsw-worker.js', { enabled: false })] });
    const pipeline = { ...createPipeline('Linked pipeline'), steps: [createToolStep('base64')] };
    TestBed.inject(PipelineStoreService).save(pipeline);
    const runner = TestBed.inject(PipelineRunnerService);
    const run = vi.spyOn(runner, 'runPipeline');
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/pipelines/${pipeline.id}?confirmRun=1`);
    harness.detectChanges();
    await TestBed.inject(PipelineStepRegistryService).ensureLoaded();
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Linked pipeline');
    expect(run).not.toHaveBeenCalled();

    (dialog?.querySelector('button:last-child') as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledOnce();
  }, 45000);
});

describe('pipeline builder live remote changes (PD-113)', () => {
  interface BuilderView {
    pipeline(): Pipeline;
    rename(name: string): void;
  }

  afterEach(() => TestBed.inject(OverlayContainer).ngOnDestroy());

  // The builder sits inside the shell layout, so it is found in the rendered tree rather than as the routed component.
  const builderOf = (harness: RouterTestingHarness) =>
    harness.fixture.debugElement.query(By.directive(PipelineBuilder)).componentInstance as BuilderView;

  async function open() {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideServiceWorker('ngsw-worker.js', { enabled: false })] });
    const store = TestBed.inject(PipelineStoreService);
    const original = { ...createPipeline('Original'), steps: [createToolStep('base64')] };
    await store.save(original);
    const stored = store.getById(original.id) as Pipeline;
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/pipelines/${original.id}`);
    const builder = builderOf(harness);
    await TestBed.inject(PipelineStepRegistryService).ensureLoaded();
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();

    // A local edit whose commit failed: the editor holds it, the store does not.
    vi.spyOn(store, 'save').mockResolvedValueOnce({ ok: false, error: 'commit failed' });
    builder.rename('Mine');
    await Promise.resolve();

    /** Another device saved `next`; the agent already stored it and tells the renderer. */
    const remoteSaves = async (next: Pipeline) => {
      await store.save(next);
      TestBed.inject(RemoteChangesService).apply([{ entityType: 'pipeline', entityId: next.id, deleted: false, payload: store.getById(next.id) }]);
      harness.detectChanges();
    };
    const notice = () => (harness.routeNativeElement as HTMLElement).querySelector('app-remote-change-notice [role="status"]')?.textContent?.trim() ?? '';
    const click = (label: string) => {
      const button = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('app-remote-change-notice button')).find((b) => b.textContent?.trim() === label);
      (button as HTMLButtonElement).click();
      harness.detectChanges();
    };
    return { builder, stored, remoteSaves, notice, click };
  }

  it('applies a clean remote merge live and keeps the unsaved edit', async () => {
    const { builder, stored, remoteSaves, notice } = await open();
    expect(builder.pipeline().name).toBe('Mine');

    await remoteSaves({ ...stored, steps: [...stored.steps, createToolStep('base64')] });

    expect(builder.pipeline().name).toBe('Mine');
    expect(builder.pipeline().steps).toHaveLength(2);
    expect(notice()).toBe('');
  }, 45000);

  it('shows a notice for a conflicting remote change and leaves the draft alone until the user chooses', async () => {
    const { builder, stored, remoteSaves, notice, click } = await open();

    await remoteSaves({ ...stored, name: 'Theirs' });
    expect(builder.pipeline().name).toBe('Mine');
    expect(notice()).toContain('Changed on another device');

    click('Keep editing');
    expect(builder.pipeline().name).toBe('Mine');
    expect(notice()).toBe('');

    await remoteSaves({ ...stored, name: 'Theirs again' });
    expect(notice()).toContain('Changed on another device');
    click('Use the other version');
    expect(builder.pipeline().name).toBe('Theirs again');
    expect(notice()).toBe('');
  }, 45000);

  it('adopts a remote change silently when there is no unsaved edit', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideServiceWorker('ngsw-worker.js', { enabled: false })] });
    const store = TestBed.inject(PipelineStoreService);
    const original = { ...createPipeline('Original'), steps: [] };
    await store.save(original);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(`/pipelines/${original.id}`);
    const builder = builderOf(harness);
    harness.detectChanges();

    await store.save({ ...(store.getById(original.id) as Pipeline), name: 'Renamed elsewhere' });
    TestBed.inject(RemoteChangesService).apply([{ entityType: 'pipeline', entityId: original.id, deleted: false, payload: store.getById(original.id) }]);
    harness.detectChanges();

    expect(builder.pipeline().name).toBe('Renamed elsewhere');
    expect((harness.routeNativeElement as HTMLElement).querySelector('app-remote-change-notice')?.textContent?.trim()).toBe('');
  }, 45000);
});
