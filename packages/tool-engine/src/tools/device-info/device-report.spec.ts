import { describe, expect, it } from 'vitest';
import {
  buildDeviceReport,
  formatBytes,
  formatDeviceReportJson,
  formatDeviceReportText,
  userAgentSummaryFacts,
  type DeviceFact,
} from './device-report';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const fact = (id: string, group: DeviceFact['group'], label: string, value: string): DeviceFact => ({ id, group, label, value });

describe('buildDeviceReport', () => {
  it('sorts by group order then label', () => {
    const report = buildDeviceReport('web', [
      fact('net.online', 'network', 'Online', 'yes'),
      fact('loc.tz', 'locale', 'Time zone', 'UTC'),
      fact('rt.b', 'runtime', 'Zeta', '1'),
      fact('rt.a', 'runtime', 'Alpha', '2'),
      fact('os.name', 'os', 'OS', 'Windows'),
    ], NOW);
    expect(report.facts.map((f) => f.id)).toEqual(['rt.a', 'rt.b', 'loc.tz', 'os.name', 'net.online']);
    expect(report.collectedAt).toBe('2026-10-21T12:00:00.000Z');
    expect(report.surface).toBe('web');
  });

  it('drops empty values and keeps the first of a duplicate id', () => {
    const report = buildDeviceReport('desktop', [
      fact('a', 'runtime', 'A', '  '),
      fact('b', 'runtime', 'B', 'first'),
      fact('b', 'runtime', 'B again', 'second'),
      fact('c', 'runtime', 'C', ' padded '),
    ], NOW);
    expect(report.facts.map((f) => [f.id, f.value])).toEqual([['b', 'first'], ['c', 'padded']]);
  });

  it('does not mutate its input', () => {
    const input = [fact('b', 'os', 'B', '1'), fact('a', 'runtime', 'A', '1')];
    buildDeviceReport('web', input, NOW);
    expect(input.map((f) => f.id)).toEqual(['b', 'a']);
  });
});

describe('formatters', () => {
  const report = buildDeviceReport('web', [
    fact('rt.ua', 'runtime', 'User agent', 'UA/1'),
    fact('d.dpr', 'display', 'Pixel ratio', '2'),
  ], NOW);

  it('formats aligned text with group headings and skips empty groups', () => {
    expect(formatDeviceReportText(report)).toBe([
      'Device report (web) - 2026-10-21T12:00:00.000Z',
      '',
      'Runtime',
      '  User agent:   UA/1',
      '',
      'Display',
      '  Pixel ratio:  2',
    ].join('\n'));
  });

  it('formats JSON grouped by id and round-trips through JSON.parse', () => {
    expect(JSON.parse(formatDeviceReportJson(report))).toEqual({
      surface: 'web',
      collectedAt: '2026-10-21T12:00:00.000Z',
      facts: { runtime: { 'rt.ua': 'UA/1' }, display: { 'd.dpr': '2' } },
    });
  });

  it('handles an empty report', () => {
    const empty = buildDeviceReport('android', [], NOW);
    expect(formatDeviceReportText(empty)).toBe('Device report (android) - 2026-10-21T12:00:00.000Z');
    expect(JSON.parse(formatDeviceReportJson(empty)).facts).toEqual({});
  });
});

describe('formatBytes', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1 KiB'],
    [1536, '1.5 KiB'],
    [8 * 1024 ** 3, '8 GiB'],
    [Number.NaN, ''],
    [-1, ''],
  ])('formats %s as %j', (input, expected) => {
    expect(formatBytes(input)).toBe(expected);
  });
});

describe('userAgentSummaryFacts', () => {
  it('summarizes browser, engine and OS from a Chrome-on-Windows string', () => {
    const facts = userAgentSummaryFacts('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    expect(facts.find((f) => f.id === 'runtime.browser')?.value).toMatch(/^Chrome 120/);
    expect(facts.find((f) => f.id === 'os.ua-os')?.value).toMatch(/^Windows/);
  });

  it('returns nothing for an empty string', () => {
    expect(userAgentSummaryFacts('  ')).toEqual([]);
  });
});
