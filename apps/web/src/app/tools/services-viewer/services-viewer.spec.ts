import { removeBridge } from '../../core/platform/testing/recording-fs-bridge';
import { renderServices } from './services-viewer.spec-helpers';

describe('ServicesViewerTool', () => {
  afterEach(() => { removeBridge(); localStorage.clear(); });

  it('renders the service list from svc.list', async () => {
    const { element, byId } = await renderServices();
    expect(byId('service-count').textContent).toContain('4 of 4 services');
    expect(element.textContent).toContain('Spooler');
    expect(element.textContent).toContain('Dnscache');
  });

  it('filters by name and by state', async () => {
    const { byId, fixture } = await renderServices();
    const filter = byId('service-filter') as unknown as HTMLInputElement;
    filter.value = 'fax';
    filter.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(byId('service-count').textContent).toContain('1 of 4');
    filter.value = '';
    filter.dispatchEvent(new Event('input'));
    const state = byId('state-filter') as unknown as HTMLSelectElement;
    state.value = 'stopped';
    state.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(byId('service-count').textContent).toContain('1 of 4');
  });

  it('shows the selected service detail with both dependency trees, and writes nothing', async () => {
    const { byId, select, calls, methods } = await renderServices();
    await select('Spooler');
    expect(byId('detail-binary').textContent).toContain('Spooler.exe');
    expect(byId('detail-starttype').textContent).toContain('Automatic');
    expect(byId('dependency-tree').textContent).toContain('RpcSs');
    expect(byId('dependent-tree').textContent).toContain('Fax');
    expect(byId('open-process-viewer')).not.toBeNull();
    expect(methods).toContain('svc.config');
    expect(calls.plans).toEqual([]);
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  });
});
