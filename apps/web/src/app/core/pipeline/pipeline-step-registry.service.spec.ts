import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { PipelineStepRegistryService } from './pipeline-step-registry.service';

describe('PipelineStepRegistryService', () => {
  let service: PipelineStepRegistryService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PipelineStepRegistryService);
  });

  it(
    'resolves every pipeline-eligible tool and caches undefined for the rest',
    async () => {
      await service.ensureLoaded();

      expect(service.get('base64')).toBeDefined();
      expect(service.get('jwt')).toBeDefined();
      expect(service.get('this-tool-does-not-exist')).toBeUndefined();
      expect(service.eligibleToolIds()).toEqual(expect.arrayContaining(['base64', 'json', 'jwt']));
    },
    30000,
  );

  it(
    'only loads once across repeated calls',
    async () => {
      await service.ensureLoaded();
      await service.ensureLoaded();
      expect(service.get('base64')).toBeDefined();
    },
    30000,
  );
});
