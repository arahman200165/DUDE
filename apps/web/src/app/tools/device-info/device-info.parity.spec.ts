import { TestBed } from '@angular/core/testing';
import { buildDeviceReport, type DeviceFact } from '@dude/tool-engine/tools/device-info/device-report';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge } from '../../core/platform/testing/recording-fs-bridge';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { osFactsToDeviceFacts } from './device-info.collector';

const NOW = new Date('2026-10-21T12:00:00.000Z');
const BROWSER_FACTS: DeviceFact[] = [
  { id: 'runtime.platform', group: 'runtime', label: 'Platform', value: 'Win32' },
  { id: 'display.dpr', group: 'display', label: 'Device pixel ratio', value: '1.5' },
  { id: 'hardware.cpu-count', group: 'hardware', label: 'CPU cores', value: '8' },
];

describe('Device Info: web/desktop adapter parity', () => {
  afterEach(() => removeBridge());

  it('reports the same browser facts on both adapters; desktop only adds OS facts', async () => {
    removeBridge();
    const webOs = await TestBed.inject(SystemInfoService).osFacts();
    expect(webOs).toBeNull();
    const web = buildDeviceReport('web', BROWSER_FACTS, NOW);

    installBridge(fakeElectronBridge());
    const nativeOs = await TestBed.inject(SystemInfoService).osFacts();
    expect(nativeOs).not.toBeNull();
    const native = buildDeviceReport('desktop', [...osFactsToDeviceFacts(nativeOs!), ...BROWSER_FACTS], NOW);

    const shared = (id: string) => native.facts.find((fact) => fact.id === id)?.value;
    for (const fact of web.facts.filter((entry) => entry.id !== 'hardware.cpu-count')) expect(shared(fact.id)).toBe(fact.value);
    expect(native.facts.some((fact) => fact.group === 'os')).toBe(true);
    expect(web.facts.some((fact) => fact.group === 'os')).toBe(false);
    // The native CPU count wins over the browser's logical-processor hint.
    expect(shared('hardware.cpu-count')).toBe('8');
  });
});
