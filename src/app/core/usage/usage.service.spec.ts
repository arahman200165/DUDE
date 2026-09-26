import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { UsageService } from './usage.service';

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('UsageService', () => {
  let service: UsageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(UsageService);
  });

  it('starts with zero frequency and empty recents', () => {
    expect(service.frequencyOf('base64')).toBe(0);
    expect(service.mostRecent(5)).toEqual([]);
    expect(service.mostFrequent(5)).toEqual([]);
  });

  it('increments frequency on each recorded open', () => {
    service.recordOpen('base64');
    service.recordOpen('base64');
    service.recordOpen('json');

    expect(service.frequencyOf('base64')).toBe(2);
    expect(service.frequencyOf('json')).toBe(1);
  });

  it('ranks mostFrequent by count descending', () => {
    service.recordOpen('base64');
    service.recordOpen('json');
    service.recordOpen('json');
    service.recordOpen('uuid');
    service.recordOpen('uuid');
    service.recordOpen('uuid');

    expect(service.mostFrequent(2)).toEqual(['uuid', 'json']);
  });

  it('ranks mostRecent by recency, most recent first, de-duplicated', () => {
    service.recordOpen('base64');
    service.recordOpen('json');
    service.recordOpen('base64');

    expect(service.mostRecent(5)).toEqual(['base64', 'json']);
  });

  it('exposes the raw recent log in chronological (oldest-first) order', () => {
    service.recordOpen('base64');
    service.recordOpen('json');

    expect(service.recentLogRaw().map((e) => e.toolId)).toEqual(['base64', 'json']);
  });

  it('survives a fresh service instance via persistence', async () => {
    service.recordOpen('base64');
    await stable();

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const freshService = TestBed.inject(UsageService);

    expect(freshService.frequencyOf('base64')).toBe(1);
  });
});
