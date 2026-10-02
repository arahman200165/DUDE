import { TestBed } from '@angular/core/testing';
import { fakeElectronBridge } from '../../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge } from '../../../core/platform/testing/recording-fs-bridge';
import { ElevationBanner } from './elevation-banner';

async function render(inputs: Record<string, unknown>, bridge: Parameters<typeof fakeElectronBridge>[0]) {
  installBridge(fakeElectronBridge(bridge));
  const fixture = TestBed.createComponent(ElevationBanner);
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const click = (el: HTMLElement, label: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)?.click();

describe('ElevationBanner', () => {
  afterEach(() => removeBridge());

  it('renders nothing when already elevated', async () => {
    const { el } = await render({ deniedCount: 3 }, { elevation: { status: async () => true, relaunch: async () => true } });
    expect(el.textContent?.trim()).toBe('');
  });

  it('renders nothing when nothing was denied and admin is not required', async () => {
    const { el } = await render({}, { elevation: { status: async () => false, relaunch: async () => true } });
    expect(el.textContent?.trim()).toBe('');
  });

  it('counts denied items', async () => {
    const { el } = await render({ deniedCount: 2 }, { elevation: { status: async () => false, relaunch: async () => true } });
    expect(el.textContent).toContain('2 items need administrator access.');
  });

  it('names the feature when elevation is required', async () => {
    const { el } = await render({ required: true, feature: 'Service control' }, { elevation: { status: async () => false, relaunch: async () => true } });
    expect(el.textContent).toContain('Service control needs an elevated session.');
  });

  it('requires an explicit confirmation before relaunching, and reports a declined relaunch', async () => {
    const relaunch = vi.fn(async () => false);
    const { fixture, el } = await render({ deniedCount: 1 }, { elevation: { status: async () => false, relaunch } });
    click(el, 'Relaunch as Administrator');
    fixture.detectChanges();
    expect(relaunch).not.toHaveBeenCalled();
    expect(el.textContent).toContain('No check runs automatically after relaunch.');
    click(el, 'Request elevation');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(relaunch).toHaveBeenCalledOnce();
    expect(el.textContent).toContain('Administrator relaunch was declined. Current session is unchanged.');
  });

  it('Cancel dismisses the confirmation without relaunching', async () => {
    const relaunch = vi.fn(async () => true);
    const { fixture, el } = await render({ deniedCount: 1 }, { elevation: { status: async () => false, relaunch } });
    click(el, 'Relaunch as Administrator');
    fixture.detectChanges();
    click(el, 'Cancel');
    fixture.detectChanges();
    expect(relaunch).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain('Request elevation');
  });
});
