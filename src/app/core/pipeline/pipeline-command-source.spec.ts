import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { PIPELINE_COMMAND_SOURCE_PROVIDERS, PipelineCommandSource } from './pipeline-command-source';
import { PipelineStoreService } from './pipeline-store.service';
import { createPipeline } from './pipeline.model';
import { routes } from '../routing/app.routes';

describe('PipelineCommandSource', () => {
  let source: PipelineCommandSource;
  let pipelineStore: PipelineStoreService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...PIPELINE_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(PipelineCommandSource);
    pipelineStore = TestBed.inject(PipelineStoreService);
    router = TestBed.inject(Router);
  });

  it('exposes one navigate-only command per saved pipeline', async () => {
    const pipeline = createPipeline('My Pipeline');
    pipelineStore.save(pipeline);
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    const command = source.commands().find((c) => c.id === `pipeline:open:${pipeline.id}`)!;
    expect(command.title).toBe(`Pipeline: ${pipeline.name}`);
    expect(command.kind).toBe('pipeline');

    await command.execute();

    expect(navigateSpy).toHaveBeenCalledWith(['/pipelines', pipeline.id]);
  });
});
