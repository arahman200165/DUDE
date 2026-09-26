import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from '../../../testing/property-harness';
import { extractCronJobSchedule, testCronJobSchedule } from './k8s-cronjob-tester-logic';

describe('k8s-cronjob-tester properties', () => {
  it('never throws while extracting arbitrary manifest or schedule text', () => {
    neverThrows(extractCronJobSchedule, fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
  it('never throws while testing arbitrary extracted schedules', () => {
    neverThrows((input) => testCronJobSchedule(input, 3, 'utc', new Date('2025-01-01T00:00:00Z')), fc.string(), { assertShape: (result) => expect(result).toHaveProperty('ok') });
  });
});
