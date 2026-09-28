import { bucketOpensByDay } from './activity-summary';

describe('bucketOpensByDay', () => {
  it('produces one zero-valued bucket per day when the log is empty', () => {
    const points = bucketOpensByDay([], { days: 3, now: new Date('2026-01-10T12:00:00Z') });

    expect(points).toHaveLength(3);
    expect(points.every((p) => p.value === 0)).toBe(true);
  });

  it('counts entries into the day they occurred, oldest bucket first', () => {
    const log = [
      { toolId: 'a', at: '2026-01-08T09:00:00.000Z' },
      { toolId: 'b', at: '2026-01-08T10:00:00.000Z' },
      { toolId: 'c', at: '2026-01-10T09:00:00.000Z' },
    ];

    const points = bucketOpensByDay(log, { days: 3, now: new Date('2026-01-10T12:00:00Z') });

    expect(points.map((p) => p.value)).toEqual([2, 0, 1]);
  });

  it('ignores entries older than the trailing window', () => {
    const log = [{ toolId: 'a', at: '2025-12-01T09:00:00.000Z' }];

    const points = bucketOpensByDay(log, { days: 3, now: new Date('2026-01-10T12:00:00Z') });

    expect(points.reduce((sum, p) => sum + p.value, 0)).toBe(0);
  });
});
