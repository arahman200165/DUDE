import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SuggestionDismissalService } from './suggestion-dismissal.service';

describe('SuggestionDismissalService', () => {
  let service: SuggestionDismissalService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(SuggestionDismissalService);
  });

  it('starts with nothing dismissed', () => {
    expect(service.isDismissed('base64>json')).toBe(false);
  });

  it('marks a key as dismissed and is idempotent', () => {
    service.dismiss('base64>json');
    service.dismiss('base64>json');
    expect(service.isDismissed('base64>json')).toBe(true);
  });

  it('tracks multiple keys independently', () => {
    service.dismiss('base64>json');
    expect(service.isDismissed('json>base64')).toBe(false);
  });
});
