import { describe, expect, it } from 'vitest';
import { buildDeviceReport } from '@dude/tool-engine/tools/device-info/device-report';
import { reportSections, rowKey } from './device-info-mobile';

describe('device-info mobile sections', () => {
  const report = buildDeviceReport('android', [
    { id: 'display.pixel-ratio', group: 'display', label: 'Pixel ratio', value: '2.75' },
    { id: 'runtime.hermes', group: 'runtime', label: 'Hermes engine', value: 'Yes' },
    { id: 'os.os-version', group: 'os', label: 'Android version', value: '' },
  ], new Date(0));

  it('orders groups, drops empty ones and strips the group prefix from keys', () => {
    const sections = reportSections(report);
    expect(sections.map(section => section.group)).toEqual(['runtime', 'display']);
    expect(sections[0]?.rows[0]).toEqual({ key: 'hermes', label: 'Hermes engine', value: 'Yes' });
    expect(sections[1]?.rows[0]?.key).toBe('pixel-ratio');
  });
  it('keeps ids without the prefix', () => { expect(rowKey('x', 'os')).toBe('x'); });
});
