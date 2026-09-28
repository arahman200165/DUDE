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

  describe('daily buckets', () => {
    const day = (d: number, h = 12) => new Date(2026, 0, d, h);

    it('reports an untracked, partial period before any open', () => {
      const period = service.activityPeriod(7, day(10));
      expect(period.since).toBeNull();
      expect(period.complete).toBe(false);
      expect(period.days.every((d) => d.opens === null)).toBe(true);
    });

    it('tracks from the first open, labels partial, and completes after 7 days', () => {
      service.recordOpen('base64', day(4));
      service.recordOpen('json', day(6));
      service.recordOpen('json', day(6, 15));

      const partial = service.activityPeriod(7, day(8));
      expect(partial.since).toBe('2026-01-04');
      expect(partial.complete).toBe(false);
      expect(partial.totalOpens).toBe(3);
      expect(partial.uniqueTools).toBe(2);

      expect(service.activityPeriod(7, day(11)).complete).toBe(true);
    });

    it('records lifetime counts and lastUsedAt alongside buckets with a single recorder', () => {
      service.recordOpen('base64', day(4));
      service.recordOpen('base64', day(5));

      expect(service.lifetimeCounts()).toEqual({ base64: 2 });
      expect(service.lastUsedAt('base64')).toBe(day(5).toISOString());
      expect(service.activityPeriod(7, day(5)).totalOpens).toBe(2);
    });

    it('persists buckets and tracking start across a fresh instance', async () => {
      service.recordOpen('base64', day(4));
      await stable();

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const fresh = TestBed.inject(UsageService).activityPeriod(7, day(4));

      expect(fresh.since).toBe('2026-01-04');
      expect(fresh.totalOpens).toBe(1);
    });

    it('migrates a persisted v1 store without inventing tracked days', async () => {
      localStorage.setItem(
        'dude:v1:__usage__:activity',
        JSON.stringify({
          schemaVersion: 1,
          counts: { base64: { count: 5, lastUsedAt: day(3).toISOString() } },
          recentLog: [{ toolId: 'base64', at: day(3).toISOString() }],
        }),
      );
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({});
      const migrated = TestBed.inject(UsageService);

      expect(migrated.frequencyOf('base64')).toBe(5);
      expect(migrated.recentLogRaw()).toHaveLength(1);
      const period = migrated.activityPeriod(7, day(4));
      expect(period.since).toBeNull();
      expect(period.totalOpens).toBe(0);
    });
  });
});
