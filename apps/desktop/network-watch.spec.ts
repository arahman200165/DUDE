import { describe, expect, it } from 'vitest';
import { alertsFor, foldCheck, jitter, statusFor, summarizeStatuses } from './network-watch';
import type { WatchCheck, WatchEntry, WatchSettings } from "@dude/contracts/core/platform/network-types";

const settings: WatchSettings = { enabled: true, intervalHours: 24, thresholds: [30, 14, 7, 1], failureAlertAfter: 3, notifications: true };
const entry = (over: Partial<WatchEntry> = {}): WatchEntry => ({ id: '1', label: 'x', host: 'h', port: 443, history: [], consecutiveFailures: 0, notified: [], ...over });
const check = (over: Partial<WatchCheck> = {}): WatchCheck => ({ checkedAt: '2026-01-01T00:00:00Z', status: 'ok', ...over });

describe('watch status', () => {
  it('buckets by days remaining and error', () => {
    expect(statusFor({ daysRemaining: 100, status: 'ok' }, settings.thresholds)).toBe('ok');
    expect(statusFor({ daysRemaining: 20, status: 'ok' }, settings.thresholds)).toBe('warning');
    expect(statusFor({ daysRemaining: -1, status: 'ok' }, settings.thresholds)).toBe('expired');
    expect(statusFor({ daysRemaining: undefined, status: 'error' }, settings.thresholds)).toBe('error');
  });
});

describe('alerts and dedup', () => {
  it('raises one alert per crossed threshold and never repeats it', () => {
    const first = alertsFor(entry(), check({ daysRemaining: 13 }), settings);
    expect(first).toEqual(['t:14']);
    expect(alertsFor(entry({ notified: ['t:14'] }), check({ daysRemaining: 13 }), settings)).toEqual([]);
    expect(alertsFor(entry({ notified: ['t:14'] }), check({ daysRemaining: 6 }), settings)).toEqual(['t:7']);
  });
  it('alerts on expiry, fingerprint change, and repeated failures only past the threshold', () => {
    expect(alertsFor(entry(), check({ daysRemaining: -1 }), settings)).toEqual(['expired']);
    expect(alertsFor(entry({ pinnedFingerprint: 'AA' }), check({ daysRemaining: 100, fingerprint256: 'BB' }), settings)).toContain('fp:BB');
    expect(alertsFor(entry({ consecutiveFailures: 1 }), check({ status: 'error' }), settings)).toEqual([]);
    expect(alertsFor(entry({ consecutiveFailures: 2 }), check({ status: 'error' }), settings)).toEqual(['fail:3']);
  });
});

describe('foldCheck', () => {
  it('accumulates history, resets notifications when the certificate is renewed, and tracks failures', () => {
    let current = entry({ last: check({ fingerprint256: 'AA', daysRemaining: 5 }), notified: ['t:7'] });
    // Same cert, now inside 1-day threshold: adds t:1, keeps t:7.
    let folded = foldCheck(current, check({ fingerprint256: 'AA', daysRemaining: 1 }), settings);
    expect(folded.entry.notified.sort()).toEqual(['t:1', 't:7']);
    // Renewal: new fingerprint clears prior notifications so future thresholds fire again.
    current = folded.entry;
    folded = foldCheck(current, check({ fingerprint256: 'CC', daysRemaining: 90 }), settings);
    expect(folded.entry.notified).toEqual([]);
    expect(folded.entry.history.length).toBe(2);
    // Errors increment the failure counter; a success resets it.
    folded = foldCheck(folded.entry, check({ status: 'error' }), settings);
    expect(folded.entry.consecutiveFailures).toBe(1);
    expect(foldCheck(folded.entry, check({ status: 'ok', fingerprint256: 'CC', daysRemaining: 90 }), settings).entry.consecutiveFailures).toBe(0);
  });
});

describe('scheduling helpers', () => {
  it('jitters within ±10% and summarizes statuses', () => {
    expect(jitter(1000, () => 0)).toBe(900);
    expect(jitter(1000, () => 1)).toBe(1100);
    expect(jitter(1000, () => 0.5)).toBe(1000);
    const summary = summarizeStatuses([entry({ last: check({ status: 'warning' }) }), entry({ last: check({ status: 'expired' }) }), entry({ last: check({ status: 'error' }) })]);
    expect(summary).toEqual({ expiring: 1, expired: 1, errors: 1 });
  });
});
