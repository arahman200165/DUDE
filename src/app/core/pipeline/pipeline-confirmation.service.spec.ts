import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OverlayContainer } from '@angular/cdk/overlay';
import { createPipeline, createScriptStep } from './pipeline.model';
import { PipelineConfirmationService } from './pipeline-confirmation.service';

describe('PipelineConfirmationService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));
  afterEach(() => TestBed.inject(OverlayContainer).ngOnDestroy());

  it('includes script code execution in the visible consequence summary', () => {
    const service = TestBed.inject(PipelineConfirmationService);
    const pipeline = { ...createPipeline('My pipeline'), steps: [createScriptStep('script-id')] };
    expect(service.summarize(pipeline)).toMatchObject({
      name: 'My pipeline',
      steps: [{ label: 'Missing script', consequenceClasses: ['code-execution'] }],
      consequenceClasses: ['code-execution'],
    });
  });

  it('never runs a callback on open or cancel; only the explicit Run click can trigger it', async () => {
    const service = TestBed.inject(PipelineConfirmationService);
    const run = vi.fn();
    const summary = { name: 'Preview', steps: [{ label: 'Step one', consequenceClasses: [] }], consequenceClasses: [] };

    service.confirm(summary, run);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(run).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Step one');

    (document.querySelector('[role="dialog"] button') as HTMLButtonElement).click();
    expect(run).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();

    service.confirm(summary, run);
    await TestBed.inject(ApplicationRef).whenStable();
    (document.querySelector('[role="dialog"] button:last-child') as HTMLButtonElement).click();
    expect(run).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
