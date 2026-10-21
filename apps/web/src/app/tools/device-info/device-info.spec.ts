import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge } from '../../core/platform/testing/recording-fs-bridge';
import { DeviceInfo } from './device-info';

async function render(): Promise<HTMLElement> {
  const fixture = TestBed.createComponent(DeviceInfo);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  for (let attempt = 0; attempt < 50 && (element.textContent ?? '').includes('Refreshing'); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    fixture.detectChanges();
  }
  return fixture.nativeElement as HTMLElement;
}

describe('DeviceInfo', () => {
  afterEach(() => removeBridge());

  it('renders grouped browser facts and the desktop note on the web', async () => {
    removeBridge();
    const element = await render();
    const text = element.textContent ?? '';
    expect(text).toContain('Runtime');
    expect(text).toContain('Display');
    expect(text).toContain('User agent');
    expect(text).toContain('OS details are available in the desktop app.');
    expect(text).not.toContain('Total memory');
  });

  it('adds OS facts on desktop and drops the note', async () => {
    installBridge(fakeElectronBridge());
    const element = await render();
    const text = element.textContent ?? '';
    expect(text).toContain('Operating system');
    expect(text).toContain('Windows 11 Pro');
    expect(text).toContain('Total memory');
    expect(text).not.toContain('OS details are available in the desktop app.');
  });
});
