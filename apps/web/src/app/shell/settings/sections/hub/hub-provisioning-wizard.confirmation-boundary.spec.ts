import { TestBed } from '@angular/core/testing';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import {
  PHRASE, byId, click, field, goTo, mountWizard, previewTunnel, start, stepCalls, stepNames, type, type Mounted,
} from './testing/provisioning-test-harness';

/**
 * Destructive-Action Contract for the Hub provisioning wizard (Milestone 853): the exposure-widening tunnel and the machine-setting power and standby
 * changes are two-step (a preview that changes nothing, then an explicit Confirm). A preview only ever calls its `*-preview` step; an `*-apply` step is
 * never called by rendering, by a preview, by Skip, Cancel, Escape or an auto-submit; the tunnel apply never runs without the exact typed phrase;
 * and an apply sends exactly the token its own preview returned.
 */
const APPLY_STEPS = ['tunnel-apply', 'power-apply', 'standby-apply', 'restart'];
const appliesIn = (m: Mounted): string[] => stepNames(m).filter((s) => APPLY_STEPS.includes(s));
const escape = (m: Mounted) => byId(m.el, 'hub-provisioning')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

describe('Hub provisioning wizard confirmation boundary', () => {
  afterEach(() => {
    document.body.replaceChildren();
    TestBed.resetTestingModule();
  });

  it('rendering, starting the session and walking every step by Skip never apply anything', async () => {
    const m = await mountWizard({ standby: true });
    expect(m.port.provisionOpen).not.toHaveBeenCalled();
    expect(stepNames(m)).toEqual([]);
    await start(m);
    await goTo(m, 'Finish');
    expect(stepNames(m)).toEqual([]);
    expect(m.port.provisionChooseBackupFolder).not.toHaveBeenCalled();
  });

  describe('tunnel', () => {
    it('the preview calls only tunnel-preview, never tunnel-apply', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      expect(stepNames(m)).toEqual(['tunnel-preview']);
      expect(byId(m.el, 'tunnel-preview')).not.toBeNull();
    });

    it('is never applied without the exact phrase (and the token the preview asked for)', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      const apply = byId(m.el, 'tunnel-apply') as HTMLButtonElement;
      await type(m, 'tunnel-token', 'cf-token');
      for (const wrong of ['', 'expose hub through cloudflare', `${PHRASE} `, ` ${PHRASE}`, PHRASE.slice(0, -1), `${PHRASE}!`]) {
        await type(m, 'tunnel-phrase', wrong);
        expect(apply.disabled).toBe(true);
        apply.click();
        await new Promise<void>((r) => setTimeout(r));
      }
      // A forced click on a disabled button and a submit of the form are both ignored.
      expect(appliesIn(m)).toEqual([]);
      await type(m, 'tunnel-phrase', PHRASE);
      await type(m, 'tunnel-token', '');
      expect(apply.disabled).toBe(true);
      expect(appliesIn(m)).toEqual([]);
    });

    it('the phrase is never pre-filled, and Escape, Change the hostname and Skip drop the preview without applying', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      expect(field(m.el, 'tunnel-phrase').value).toBe('');
      await type(m, 'tunnel-phrase', PHRASE);
      escape(m);
      await new Promise<void>((r) => setTimeout(r));
      m.fixture.detectChanges();
      expect(byId(m.el, 'tunnel-form')).not.toBeNull();
      await previewTunnel(m);
      expect(field(m.el, 'tunnel-phrase').value).toBe('');
      await click(m, 'Change the hostname');
      expect(byId(m.el, 'tunnel-form')).not.toBeNull();
      await click(m, 'tunnel-preview-button');
      await click(m, 'step-next');
      expect(appliesIn(m)).toEqual([]);
    });

    it('sends exactly the token its own (latest) preview returned, once', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      await click(m, 'Change the hostname');
      await type(m, 'tunnel-hostname', 'hub.example.com');
      await click(m, 'tunnel-preview-button');
      expect(stepNames(m)).toEqual(['tunnel-preview', 'tunnel-preview']);
      await type(m, 'tunnel-token', 'cf-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      expect(stepCalls(m).filter((r) => r.step === 'tunnel-apply')).toEqual([
        { step: 'tunnel-apply', hostname: 'hub.example.com', confirmToken: 'fake-confirm-2', acknowledgement: PHRASE, acceptUnverifiedReachability: false, connectorToken: 'cf-token' },
      ]);
    });

    it('an expired preview returns to the preview form and cannot be applied again', async () => {
      const m = await mountWizard({ failures: { 'tunnel-apply': new HubAdminError('stale-preview', 'raw') } });
      await start(m);
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      expect(byId(m.el, 'tunnel-apply')).toBeNull();
      expect(byId(m.el, 'tunnel-form')).not.toBeNull();
      expect(appliesIn(m)).toEqual(['tunnel-apply']);
    });
  });

  describe('power and standby', () => {
    it('the previews call only their preview step and show Confirm without applying', async () => {
      const m = await mountWizard({ standby: true });
      await start(m);
      await goTo(m, 'Power');
      await click(m, 'power-preview-button');
      expect(stepNames(m)).toEqual(['power-preview']);
      expect(byId(m.el, 'power-confirm')).not.toBeNull();
      await goTo(m, 'Standby copy');
      await click(m, 'standby-choose');
      await click(m, 'standby-preview-button');
      expect(stepNames(m)).toEqual(['power-preview', 'standby-preview']);
      expect(byId(m.el, 'standby-confirm')).not.toBeNull();
      expect(appliesIn(m)).toEqual([]);
    });

    it('Back, Escape and Skip drop a preview without applying', async () => {
      const m = await mountWizard({ standby: true });
      await start(m);
      await goTo(m, 'Power');
      await click(m, 'power-preview-button');
      await click(m, 'Back');
      expect(byId(m.el, 'power-confirm')).toBeNull();
      await click(m, 'power-preview-button');
      escape(m);
      await new Promise<void>((r) => setTimeout(r));
      m.fixture.detectChanges();
      expect(byId(m.el, 'power-confirm')).toBeNull();
      await click(m, 'power-preview-button');
      await click(m, 'step-next');
      expect(appliesIn(m)).toEqual([]);
    });

    it('Confirm sends exactly the previewed token, once, for power and for standby', async () => {
      const m = await mountWizard({ standby: true });
      await start(m);
      await goTo(m, 'Power');
      await click(m, 'power-preview-button');
      await click(m, 'power-confirm');
      await goTo(m, 'Standby copy');
      await click(m, 'standby-choose');
      await click(m, 'standby-preview-button');
      await click(m, 'standby-confirm');
      expect(stepCalls(m).filter((r) => r.step.endsWith('-apply'))).toEqual([
        { step: 'power-apply', confirmToken: 'fake-confirm-1' },
        { step: 'standby-apply', confirmToken: 'fake-confirm-2' },
      ]);
      expect(byId(m.el, 'power-confirm')).toBeNull();
    });

    it('an expired preview drops back to the preview button with the message and is not re-sent', async () => {
      const m = await mountWizard({ failures: { 'power-apply': new HubAdminError('stale-preview', 'raw') } });
      await start(m);
      await goTo(m, 'Power');
      await click(m, 'power-preview-button');
      await click(m, 'power-confirm');
      expect(byId(m.el, 'power-confirm')).toBeNull();
      expect(byId(m.el, 'power-preview-button')).not.toBeNull();
      expect(byId(m.el, 'provision-error')?.textContent).toMatch(/Preview again/);
      expect(appliesIn(m)).toEqual(['power-apply']);
    });
  });

  describe('restart and the end of the session', () => {
    it('Restart is a click on the finish step, never automatic, and Close and Cancel never restart', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      await type(m, 'tunnel-token', 'cf-token');
      await type(m, 'tunnel-phrase', PHRASE);
      await click(m, 'tunnel-apply');
      await goTo(m, 'Finish');
      expect(stepNames(m)).not.toContain('restart');
      await click(m, 'close-wizard');
      expect(stepNames(m)).not.toContain('restart');
      expect(m.port.provisionClose).toHaveBeenCalledTimes(1);

      await start(m);
      await click(m, 'cancel-wizard');
      expect(stepNames(m)).not.toContain('restart');
    });

    it('a session that closes by itself applies nothing', async () => {
      const m = await mountWizard();
      await start(m);
      await previewTunnel(m);
      m.emitProvision({ kind: 'session', state: 'closed', reason: 'ended' });
      await new Promise<void>((r) => setTimeout(r));
      m.fixture.detectChanges();
      expect(appliesIn(m)).toEqual([]);
      expect(byId(m.el, 'provision-start')).not.toBeNull();
    });
  });
});
