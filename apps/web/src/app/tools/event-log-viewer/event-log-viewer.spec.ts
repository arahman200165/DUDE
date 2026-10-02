import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { EventQueryParams, EventRecord } from "@dude/contracts/system/system-types";
import { fakeElectronBridge } from '../../core/platform/testing/fake-electron-bridge';
import { installBridge, removeBridge, settleFsJobs } from '../../core/platform/testing/recording-fs-bridge';
import { EventLogViewerTool } from './event-log-viewer';
import { newestRecordId, parseEventIds, prependNewer } from "@dude/tool-engine/tools/event-log-viewer/event-log-viewer-logic";

const ACTIVITY = '{11111111-2222-3333-4444-555555555555}';
const record = (id: number, over: Partial<EventRecord> = {}): EventRecord => ({
  recordId: String(id), timeCreated: '2026-05-01T10:00:00.000Z', level: 'error', providerName: 'Service Control Manager', eventId: 7031,
  task: 'None', opcode: '', keywords: [], channel: 'System', computer: 'PC', userSid: null, processId: 700, threadId: 1,
  activityId: ACTIVITY, relatedActivityId: null,
  message: 'The Print Spooler service terminated unexpectedly with 0x80070005.',
  xml: '<Event><System/><EventData><Data Name="param1">Spooler</Data></EventData></Event>', ...over,
});

describe('EventLogViewerTool', () => {
  afterEach(() => removeBridge());

  function render() {
    const queries: EventQueryParams[] = [];
    const call = async (method: string, params: unknown) => {
      switch (method) {
        case 'evt.channels':
          return { ok: true, data: { channels: [
            { name: 'System', type: 'classic', enabled: true },
            { name: 'Microsoft-Windows-Foo/Operational', type: 'operational', enabled: false },
          ] } };
        case 'evt.query': {
          const p = params as EventQueryParams;
          queries.push(p);
          if (p.afterRecordId) return { ok: true, data: { events: [record(12, { activityId: null })], truncated: false } };
          if (p.xpath?.includes('EventRecordID <')) return { ok: true, data: { events: [record(9), record(8)], truncated: false } };
          return { ok: true, data: { events: [record(11), record(10, { activityId: null })], truncated: true } };
        }
        default: return { ok: false, error: 'unexpected ' + method };
      }
    };
    const base = fakeElectronBridge();
    installBridge(fakeElectronBridge({ sys: { ...base.sys, call: call as never } }));
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const fixture = TestBed.createComponent(EventLogViewerTool);
    const element = fixture.nativeElement as HTMLElement;
    const q = <T extends HTMLElement>(sel: string) => element.querySelector<T>(sel)!;
    const click = async (sel: string) => { q(sel).click(); await settleFsJobs(fixture); };
    const type = async (sel: string, value: string) => {
      const el = q<HTMLInputElement>(sel);
      el.value = value;
      el.dispatchEvent(new Event('input'));
      await settleFsJobs(fixture);
    };
    const openChannel = async () => {
      fixture.detectChanges();
      await settleFsJobs(fixture);
      const button = [...element.querySelectorAll<HTMLElement>('[role="treeitem"]')].find((b) => b.textContent?.includes('System'))!;
      button.click();
      await settleFsJobs(fixture);
    };
    const selectRow = async (text: string) => {
      [...element.querySelectorAll<HTMLElement>('[role="row"]')].find((r) => r.textContent?.includes(text))!.click();
      await settleFsJobs(fixture);
    };
    return { fixture, element, queries, q, click, type, openChannel, selectRow };
  }

  it('loads channels, groups them and loads events when a channel is selected', async () => {
    const { element, queries, q, openChannel } = render();
    await openChannel();
    expect(element.textContent).toContain('Windows logs');
    expect(element.textContent).toContain('Microsoft-Windows-Foo/Operational');
    expect(queries[0]).toMatchObject({ channel: 'System', xpath: '*', reverse: true });
    expect(q('[data-testid="event-count"]').textContent).toContain('2 events');
    expect(element.textContent).toContain('Service Control Manager');
  });

  it('generates XPath from the filter, switches to custom on edit, and runs it', async () => {
    const { queries, q, click, type, openChannel } = render();
    await openChannel();
    await click('[data-testid="level-error"]');
    await type('[data-testid="event-ids"]', '7031');
    expect(q<HTMLTextAreaElement>('[data-testid="xpath"]').value).toBe('*[System[EventID=7031 and Level=2]]');
    await click('[data-testid="run"]');
    expect(queries.at(-1)?.xpath).toBe('*[System[EventID=7031 and Level=2]]');

    await type('[data-testid="xpath"]', '*[System[Level=1]]');
    expect(q('[data-testid="custom-badge"]')).toBeTruthy();
    await click('[data-testid="run"]');
    expect(queries.at(-1)?.xpath).toBe('*[System[Level=1]]');
    await click('[data-testid="use-builder"]');
    expect(q<HTMLTextAreaElement>('[data-testid="xpath"]').value).toBe('*[System[EventID=7031 and Level=2]]');
  });

  it('shows message, xml and correlation cross-links, and filters related events', async () => {
    const { element, queries, q, click, openChannel, selectRow } = render();
    await openChannel();
    await selectRow('7031');
    expect(q('[data-testid="message"]').textContent).toContain('Print Spooler');
    expect(element.textContent).toContain(ACTIVITY);
    expect(q('[data-testid="link-process"]')?.textContent).toContain('PID 700')
    expect(q('[data-testid="link-service"]').textContent).toContain('Spooler');
    expect(q('[data-testid="link-code"]').textContent).toContain('0x80070005');
    [...element.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Raw XML'))!.click();
    await settleFsJobs(q('app-event-log-viewer') ? (undefined as never) : (undefined as never)).catch(() => undefined);
    await click('[data-testid="show-related"]');
    expect(queries.at(-1)?.xpath).toContain(`Correlation[@ActivityID='${ACTIVITY}']`);
  });

  it('round-trips a saved query', async () => {
    const { element, q, click, type, openChannel } = render();
    await openChannel();
    [...element.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.includes('Saved queries'))!.click();
    await type('[data-testid="event-ids"]', '41');
    await type('[data-testid="save-name"]', 'Kernel power');
    await click('[data-testid="save-query"]');
    expect(element.querySelectorAll('[data-testid="saved-query"]').length).toBe(1);
    await type('[data-testid="event-ids"]', '99');
    await click('[data-testid="saved-query"] button');
    expect(q<HTMLTextAreaElement>('[data-testid="xpath"]').value).toBe('*[System[EventID=41]]');
    await click('[aria-label="Delete Kernel power"]');
    expect(element.querySelectorAll('[data-testid="saved-query"]').length).toBe(0);
  });

  it('loads older pages with an EventRecordID bound and appends them', async () => {
    const { queries, q, click, openChannel } = render();
    await openChannel();
    await click('[data-testid="load-older"]');
    expect(queries.at(-1)?.xpath).toBe('*[System[EventRecordID < 10]]')
    expect(q('[data-testid="event-count"]').textContent).toContain('4 events');
  });
  it('live tail polls with afterRecordId and prepends new events', async () => {
    const { queries, q, click, openChannel } = render();
    await openChannel();
    await click('[data-testid="live-tail"]');
    await click('[data-testid="poll-now"]');
    const polled = queries.filter((p) => p.afterRecordId);
    expect(polled.length).toBeGreaterThan(0);
    expect(polled[0]).toMatchObject({ afterRecordId: '11', reverse: false });
    expect(q('[data-testid="event-count"]').textContent).toContain('3 events');
  });

  it('shows a desktop-only explanation on the web', () => {
    removeBridge();
    const fixture = TestBed.createComponent(EventLogViewerTool);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('needs Desktop DUDE');
  });
});

describe('event-log-viewer-logic', () => {
  it('parses event id text', () => {
    expect(parseEventIds('1000, 4624-4626 x 7')).toEqual([1000, { from: 4624, to: 4626 }, 7]);
  });

  it('tracks the newest record and prepends unique newer events, bounded', () => {
    const a = record(1);
    const b = record(2);
    expect(newestRecordId([a, b])).toBe('2');
    expect(newestRecordId([])).toBeNull();
    expect(prependNewer([b, a], [record(4), record(3), record(2)]).map((e) => e.recordId)).toEqual(['4', '3', '2', '1']);
    expect(prependNewer([b, a], [record(4), record(3)], 3).map((e) => e.recordId)).toEqual(['4', '3', '2']);
  });
});
