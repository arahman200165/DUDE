import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PipelineStoreService } from './pipeline-store.service';
import { createPipeline, createToolStep } from "@dude/domain/core/pipeline/pipeline.model";

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('PipelineStoreService', () => {
  let service: PipelineStoreService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(PipelineStoreService);
  });

  it('starts empty', () => {
    expect(service.pipelines()).toEqual([]);
  });

  it('saves and retrieves a pipeline by id', () => {
    const pipeline = createPipeline('My Pipeline');
    service.save(pipeline);

    expect(service.getById(pipeline.id)?.name).toBe('My Pipeline');
    expect(service.pipelines()).toHaveLength(1);
  });

  it('upserts on save with a matching id', () => {
    const pipeline = createPipeline('Original');
    service.save(pipeline);
    service.save({ ...pipeline, name: 'Renamed' });

    expect(service.pipelines()).toHaveLength(1);
    expect(service.getById(pipeline.id)?.name).toBe('Renamed');
  });

  it('removes a pipeline by id', () => {
    const pipeline = createPipeline('Doomed');
    service.save(pipeline);
    service.remove(pipeline.id);

    expect(service.getById(pipeline.id)).toBeUndefined();
  });

  it('duplicates a pipeline with a new id and adjusted name', () => {
    const original = createPipeline('Original');
    const step = createToolStep('base64');
    service.save({ ...original, steps: [step] });

    const copy = service.duplicate(original.id);

    expect(copy?.id).not.toBe(original.id);
    expect(copy?.name).toBe('Original (copy)');
    expect(copy?.steps).toEqual([step]);
    expect(service.pipelines()).toHaveLength(2);
  });

  it('survives a fresh service instance via persistence', async () => {
    const pipeline = createPipeline('Persisted');
    service.save(pipeline);
    await stable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(PipelineStoreService);

    expect(freshService.getById(pipeline.id)?.name).toBe('Persisted');
  });
});
