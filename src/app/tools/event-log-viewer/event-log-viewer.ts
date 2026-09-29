import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  EVENT_LEVELS, beforeRecordXPath, buildEventXPath, extractPids, extractServiceName, extractStatusCodes, formatLevel, hasActivity, parseCustomViewXml, relatedEvents, toCustomViewXml,
  type EventRelativeRange,
} from '../../../shared-logic/system/evt-xpath';
import type { EventChannel, EventChannelsResult, EventLevel, EventQueryFileParams, EventQueryParams, EventQueryResult, EventRecord } from '../../../shared-logic/system/system-types';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { NativeFsService } from '../../core/platform/native-fs.service';
import { PlatformService } from '../../core/platform/platform.service';
import { SystemInfoService } from '../../core/platform/system-info.service';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { DataTable, type DataTableColumn } from '../../shared/components/data-table/data-table';
import { DataTableCellDef } from '../../shared/components/data-table/data-table-cell.directive';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { Disclosure } from '../../shared/components/disclosure/disclosure';
import { SplitPane } from '../../shared/components/split-pane/split-pane';
import { StatusGlyph } from '../../shared/components/status-glyph/status-glyph';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { downloadFile } from '../../shared/utils/download-file';
import { createLiveRefresh } from '../../shared/utils/live-refresh';
import { MAX_BUFFER, formatEventTime, glyphFor, groupChannels, newestRecordId, parseEventIds, parseProviders, prependNewer } from './event-log-viewer-logic';

const TOOL_ID = 'event-log-viewer';
const PAGE_LIMIT = 500;
const TAIL_INTERVAL_MS = 3000;

interface SavedQuery { readonly name: string; readonly channel: string; readonly xpath: string }
type Source = { readonly kind: 'channel'; readonly channel: string } | { readonly kind: 'file'; readonly path: string; readonly name: string };
type QueryMode = 'builder' | 'custom';

/**
 * Event Log Viewer (DUDE_PRD.md Phase 31, Milestone 603). Read-only: lists channels, runs EvtQuery
 * XPath (built from a filter form or typed by hand) and shows rendered message, raw XML and
 * correlation cross-links. "Live (polling)" re-queries with afterRecordId; it is not a push subscription.
 */
@Component({
  selector: 'app-event-log-viewer',
  imports: [RouterLink, ToolShell, DesktopOnlyControl, SplitPane, DataTable, DataTableCellDef, StatusGlyph, Disclosure, CopyButton],
  templateUrl: './event-log-viewer.html',
})
export class EventLogViewerTool {
  protected readonly platform = inject(PlatformService);
  private readonly persistence = inject(PersistenceService);
  private readonly system = inject(SystemInfoService);
  private readonly nativeFs = inject(NativeFsService);
  private readonly router = inject(Router);

  protected readonly ratio = this.persistence.signal(TOOL_ID, 'splitRatio', 'local', 0.6);
  protected readonly savedQueries = this.persistence.signal<readonly SavedQuery[]>(TOOL_ID, 'savedQueries', 'local', []);
  protected readonly range = this.persistence.signal<EventRelativeRange | ''>(TOOL_ID, 'range', 'local', '');

  protected readonly levelOptions = EVENT_LEVELS;
  protected readonly formatLevel = formatLevel;
  protected readonly formatTime = formatEventTime;

  protected readonly channels = signal<readonly EventChannel[]>([]);
  protected readonly channelFilter = signal('');
  protected readonly groups = computed(() => groupChannels(this.channels(), this.channelFilter()));
  protected readonly source = signal<Source | null>(null);

  protected readonly mode = signal<QueryMode>('builder');
  protected readonly levels = signal<ReadonlySet<EventLevel>>(new Set());
  protected readonly providers = signal('');
  protected readonly eventIds = signal('');
  protected readonly keyword = signal('');
  protected readonly activityFilter = signal('');
  protected readonly customXpath = signal('*');
  protected readonly builtXpath = computed(() => buildEventXPath({
    levels: [...this.levels()],
    providers: parseProviders(this.providers()),
    eventIds: parseEventIds(this.eventIds()),
    timeRange: this.range() ? { last: this.range() as EventRelativeRange } : undefined,
    keywordsText: this.keyword(),
    activityId: this.activityFilter(),
  }));
  protected readonly xpath = computed(() => (this.mode() === 'builder' ? this.builtXpath() : this.customXpath()));

  protected readonly events = signal<readonly EventRecord[]>([]);
  protected readonly truncated = signal(false);
  protected readonly paging = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly selectedKey = signal<string | null>(null);
  protected readonly selected = computed(() => this.events().find((e) => this.keyOf(e) === this.selectedKey()) ?? null);
  protected readonly saveName = signal('');

  protected readonly tail = signal(false);
  protected readonly tailPaused = computed(() => !this.tail() || this.source()?.kind !== 'channel');
  protected readonly polled = signal(0);
  private readonly tailInterval = signal(TAIL_INTERVAL_MS);

  protected readonly refresh = createLiveRefresh({
    intervalMs: this.tailInterval,
    paused: this.tailPaused,
    destroyRef: inject(DestroyRef),
    tick: () => this.pollNewer(),
  });

  protected readonly columns: readonly DataTableColumn<EventRecord>[] = [
    { key: 'time', header: 'Time', value: (e) => e.timeCreated, sortable: true, width: '10.5rem' },
    { key: 'level', header: 'Level', value: (e) => e.level, sortable: true, width: '7rem' },
    { key: 'provider', header: 'Provider', value: (e) => e.providerName, sortable: true, width: 'minmax(10rem, 1fr)', truncate: true },
    { key: 'id', header: 'ID', value: (e) => String(e.eventId).padStart(8, '0'), sortable: true, width: '4.5rem' },
    { key: 'task', header: 'Task', value: (e) => e.task, width: '8rem', truncate: true },
    { key: 'computer', header: 'Computer', value: (e) => e.computer, width: '8rem', truncate: true },
  ];
  protected readonly trackRow = (_: number, e: EventRecord): string => this.keyOf(e);
  protected readonly glyph = glyphFor;

  protected readonly pids = computed(() => { const e = this.selected(); return e ? extractPids(e) : []; });
  protected readonly serviceName = computed(() => { const e = this.selected(); return e ? extractServiceName(e) : null; });
  protected readonly statusCodes = computed(() => { const e = this.selected(); return e ? extractStatusCodes(e) : []; });
  protected readonly activityId = computed(() => { const e = this.selected(); return e && hasActivity(e.activityId) ? e.activityId : null; });
  protected readonly activityGroup = computed(() => { const id = this.activityId(); return id ? relatedEvents(this.events(), id) : []; });

  constructor() {
    if (this.platform.isDesktop()) void this.loadChannels();
  }

  private keyOf(e: EventRecord): string { return `${e.channel}#${e.recordId}`; }

  private async loadChannels(): Promise<void> {
    try {
      const result: EventChannelsResult = await this.system.call('evt.channels', {});
      this.channels.set(result.channels);
    } catch (caught) {
      this.error.set(this.message(caught));
    }
  }

  private message(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }

  protected selectChannel(channel: EventChannel): void {
    this.source.set({ kind: 'channel', channel: channel.name });
    this.activityFilter.set('');
    void this.run();
  }

  protected toggleLevel(level: EventLevel): void {
    this.levels.update((set) => {
      const next = new Set(set);
      if (next.has(level)) next.delete(level);
      else next.add(level);
      return next;
    });
  }

  protected editXpath(value: string): void {
    this.customXpath.set(value);
    this.mode.set('custom');
  }

  protected useBuilder(): void { this.mode.set('builder'); }

  protected async run(): Promise<void> {
    const source = this.source();
    if (!source) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      let result: EventQueryResult;
      if (source.kind === 'channel') {
        const params: EventQueryParams = { channel: source.channel, xpath: this.xpath(), reverse: true, limit: PAGE_LIMIT };
        result = await this.system.call('evt.query', params);
      } else {
        const params: EventQueryFileParams = { path: source.path, xpath: this.xpath(), reverse: true, limit: PAGE_LIMIT };
        result = await this.system.call('evt.queryFile', params);
      }
      this.events.set(result.events);
      this.truncated.set(result.truncated);
      this.selectedKey.set(null);
    } catch (caught) {
      this.error.set(this.message(caught));
    } finally {
      this.loading.set(false);
    }
  }

  private async pollNewer(): Promise<void> {
    const source = this.source();
    if (!this.tail() || source?.kind !== 'channel') return;
    const newest = newestRecordId(this.events());
    if (newest === null) return;
    try {
      const result = await this.system.call('evt.query', { channel: source.channel, xpath: this.xpath(), reverse: false, afterRecordId: newest, limit: PAGE_LIMIT });
      this.polled.update((n) => n + 1);
      if (result.events.length) this.events.update((current) => prependNewer(current, result.events, MAX_BUFFER));
      this.error.set('');
    } catch (caught) {
      this.error.set(this.message(caught));
    }
  }

  protected async loadOlder(): Promise<void> {
    const source = this.source();
    const oldest = this.events().reduce<string | null>((value, event) => {
      if (value === null) return event.recordId;
      try { return BigInt(event.recordId) < BigInt(value) ? event.recordId : value; } catch { return value; }
    }, null);
    if (!source || !oldest || !this.truncated() || this.paging()) return;
    const xpath = beforeRecordXPath(this.xpath(), oldest);
    if (!xpath) {
      this.notice.set('This custom XPath cannot be paged by record ID.');
      return;
    }
    this.paging.set(true);
    this.error.set('');
    try {
      const result = source.kind === 'channel'
        ? await this.system.call('evt.query', { channel: source.channel, xpath, reverse: true, limit: PAGE_LIMIT })
        : await this.system.call('evt.queryFile', { path: source.path, xpath, reverse: true, limit: PAGE_LIMIT });
      const known = new Set(this.events().map((event) => this.keyOf(event)));
      const appended = result.events.filter((event) => {
        const key = this.keyOf(event);
        if (known.has(key)) return false;
        known.add(key);
        return true;
      });
      this.events.update((current) => [...current, ...appended]);
      this.truncated.set(result.truncated && result.events.length > 0);
      if (!result.events.length) this.notice.set('No older matching events were returned.');
    } catch (caught) {
      this.error.set(this.message(caught));
    } finally {
      this.paging.set(false);
    }
  }

  protected async openProcess(pid: number): Promise<void> {
    const event = this.selected();
    if (!event) return;
    try {
      const listing = await this.system.listProcesses();
      const instance = listing.processes.find((process) => process.pid === pid);
      const eventTime = Date.parse(event.timeCreated);
      if (!instance || !Number.isFinite(eventTime) || instance.createTimeMs > eventTime) {
        this.notice.set(`PID ${pid} has no current process instance old enough to match this event.`);
        return;
      }
      await this.router.navigate(['/tools/process-viewer'], { queryParams: { pid, startKey: instance.startKey } });
    } catch (caught) {
      this.error.set(this.message(caught));
    }
  }
  protected select(event: EventRecord): void { this.selectedKey.set(this.keyOf(event)); }

  protected showRelated(): void {
    const id = this.activityId();
    if (!id) return;
    this.activityFilter.set(id);
    this.mode.set('builder');
    void this.run();
  }

  protected clearRelated(): void {
    this.activityFilter.set('');
    void this.run();
  }

  // ---- saved queries, custom views, files ----------------------------------------------------

  protected saveQuery(): void {
    const source = this.source();
    const name = this.saveName().trim();
    if (source?.kind !== 'channel' || !name) return;
    const entry: SavedQuery = { name, channel: source.channel, xpath: this.xpath() };
    this.savedQueries.update((list) => [...list.filter((q) => q.name !== name), entry]);
    this.saveName.set('');
  }

  protected applyQuery(query: SavedQuery): void {
    this.source.set({ kind: 'channel', channel: query.channel });
    this.customXpath.set(query.xpath);
    this.mode.set('custom');
    void this.run();
  }

  protected deleteQuery(query: SavedQuery): void {
    this.savedQueries.update((list) => list.filter((q) => q.name !== query.name));
  }

  protected exportView(): void {
    const source = this.source();
    if (source?.kind !== 'channel') return;
    downloadFile(new Blob([toCustomViewXml(source.channel, this.xpath())], { type: 'application/xml' }), `${source.channel.replace(/[\\/:*?"<>|]/g, '_')}-view.xml`, 'application/xml');
  }

  protected async importView(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const parsed = parseCustomViewXml(await file.text());
    if (!parsed.ok) {
      this.error.set(parsed.error);
      return;
    }
    const [first] = parsed.queries;
    this.notice.set(parsed.queries.length > 1 ? `Imported ${parsed.queries.length} queries; applied the first (${first.channel}).` : `Imported custom view for ${first.channel}.${first.suppress.length ? ` Suppress filters (${first.suppress.length}) are not supported by the current event query API.` : ``}`);
    this.source.set({ kind: 'channel', channel: first.channel });
    this.customXpath.set(first.xpath);
    this.mode.set('custom');
    await this.run();
  }

  protected async openEvtx(): Promise<void> {
    try {
      const picked = await this.nativeFs.pickFile();
      if (picked.canceled) return;
      if (!/\.evtx$/i.test(picked.name)) {
        this.error.set('Choose a .evtx file.');
        return;
      }
      this.tail.set(false);
      this.source.set({ kind: 'file', path: picked.path, name: picked.name });
      this.activityFilter.set('');
      await this.run();
    } catch (caught) {
      this.error.set(this.message(caught));
    }
  }

  protected sourceLabel(): string {
    const s = this.source();
    return s ? (s.kind === 'channel' ? s.channel : s.name) : '';
  }
}
