import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from '../../../core/routing/app.routes';
import { PipelineStoreService } from '../../../core/pipeline/pipeline-store.service';
import { PipelineRunnerService } from '../../../core/pipeline/pipeline-runner.service';
import { PipelineStepRegistryService } from '../../../core/pipeline/pipeline-step-registry.service';
import { createPipeline, createToolStep } from '../../../core/pipeline/pipeline.model';

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
