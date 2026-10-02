import { removeBridge } from '../../core/platform/testing/recording-fs-bridge';
import { settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { fakeSysPlanPreview } from '../../core/platform/testing/recording-sys-bridge';
import { renderServices } from './services-viewer.spec-helpers';

describe('Services Viewer - confirmation boundary (DUDE_PRD.md 5.2.1)', () => {
  afterEach(() => removeBridge());

  const expectNothingApplied = (calls: { tokens: unknown[]; applies: unknown[] }) => {
    expect(calls.tokens).toEqual([]);
    expect(calls.applies).toEqual([]);
  };

  it('stop and restart only plan service ops with the service name, and never issue a token or apply', async () => {
    const { click, select, calls } = await renderServices();
    await select('Spooler');
    await click('action-stop');
    await click('action-restart');
    expect(calls.plans).toHaveLength(2);
    expect(calls.plans[0].tool).toBe('services-viewer');
    expect(calls.plans[0].ops).toEqual([{ kind: 'service.stop', params: { name: 'Spooler', displayName: 'Spooler service' } }]);
    expect(calls.plans[1].ops).toEqual([{ kind: 'service.restart', params: { name: 'Spooler', displayName: 'Spooler service' } }]);
    expectNothingApplied(calls);
  });

  it('start is offered for a stopped service and only plans', async () => {
    const { click, select, calls, byId } = await renderServices();
    await select('Dnscache');
    expect(byId('action-stop')).toBeNull();
    await click('action-start');
    expect(calls.plans[0].ops).toEqual([{ kind: 'service.start', params: { name: 'Dnscache', displayName: 'Dnscache service' } }]);
    expectNothingApplied(calls);
  });

  it('a startup type change only plans service.setStartType with the chosen type', async () => {
    const { click, select, byId, calls, fixture } = await renderServices();
    await select('Spooler');
    const choice = byId('starttype-select') as unknown as HTMLSelectElement;
    choice.value = 'auto-delayed';
    choice.dispatchEvent(new Event('change'));
    await settleFsJobs(fixture);
    await click('starttype-preview');
    expect(calls.plans[0].ops).toEqual([{ kind: 'service.setStartType', params: { name: 'Spooler', displayName: 'Spooler service', startType: 'auto-delayed' } }]);
    expectNothingApplied(calls);
  });

  it('the stop preview lists the running dependents that will also stop', async () => {
    const { click, select, byId } = await renderServices();
    await select('RpcSs');
    await click('action-stop');
    const impact = byId('stop-impact').textContent ?? '';
    expect(impact).toContain('2 running dependent services');
    expect(impact).toContain('Spooler');
    expect(impact).toContain('Fax');
  });

  it('start shows no stop-impact notice', async () => {
    const { click, select, byId } = await renderServices();
    await select('Dnscache');
    await click('action-start');
    expect(byId('stop-impact')).toBeNull();
  });

  it('applies only after the preview review and confirm steps', async () => {
    const { click, element, select, calls } = await renderServices();
    await select('Spooler');
    await click('action-stop');
    await click('system-change-review-apply');
    expectNothingApplied(calls);
    await click('system-change-confirm');
    expect(calls.tokens).toHaveLength(1);
    expect(calls.applies).toHaveLength(1);
    expect(element.textContent).toContain('1 applied');
  });

  it('a critical service or driver requires the typed name before a token is issued', async () => {
    const preview = fakeSysPlanPreview({ typedConfirm: ['Spooler'] });
    const { click, select, calls, element } = await renderServices({ preview });
    await select('Spooler');
    await click('action-stop');
    await click('system-change-review-apply');
    expect(element.textContent).toContain('Spooler');
    expectNothingApplied(calls);
  });

  it('a rejected token surfaces an error and nothing is applied', async () => {
    const { click, element, select, calls } = await renderServices({ tokenError: 'The preview expired; preview again.' });
    await select('Spooler');
    await click('action-stop');
    await click('system-change-review-apply');
    await click('system-change-confirm');
    expect(calls.applies).toEqual([]);
    expect(element.textContent).toContain('The preview expired');
  });
});
