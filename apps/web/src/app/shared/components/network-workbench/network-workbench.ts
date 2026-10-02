import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { Component, OnDestroy, OnInit, TemplateRef, computed, inject, input, output, signal } from '@angular/core';
import { ToolShell } from '../tool-shell/tool-shell';
import { PlatformService } from '../../../core/platform/platform.service';
import { ElevationService } from '../../../core/platform/elevation.service';
import { NetworkDiagnosticsService, type NetworkRun } from '../../../core/platform/network-diagnostics.service';
import { NetworkRunHistoryService } from '../../../core/platform/network-run-history.service';
import type { AddressFamily, DnsRecordType, DnsTransport, LocalView, NetworkJobEvent, NetworkKind, NetworkRequest, ScanProtocol } from "@dude/contracts/core/platform/network-types";
import { downloadFile } from '../../utils/download-file';
import { buildNetworkBundle } from '../../utils/network-bundle';
import { describeContacts, needsReview } from "@dude/tool-engine/shared/utils/network-contacts";

/** Context a tool's result template receives. */
export interface NetworkResultContext { readonly $implicit: unknown; readonly request: NetworkRequest | null; readonly runId: string | null }

@Component({
  selector: 'app-network-workbench',
  imports: [ToolShell, JsonPipe, NgTemplateOutlet],
  templateUrl: './network-workbench.html',
})
export class NetworkWorkbench implements OnDestroy, OnInit {
  readonly kind = input.required<NetworkKind>();
  /**
   * Phase 28 extension points: a tool supplies its own form (projected as `[workbenchForm]`) and
   * request builder, and a rich result template. The workbench keeps run/cancel/preview/history/
   * export, so each tool doesn't grow this component. Phase 27 tools use neither and are unchanged.
   */
  readonly buildRequest = input<(() => NetworkRequest) | null>(null);
  readonly customForm = input(false);
  readonly resultTemplate = input<TemplateRef<NetworkResultContext> | null>(null);
  readonly runLabel = input('Run check');
  readonly resultChange = output<{ result: unknown; request: NetworkRequest; runId: string | null }>();
  protected readonly platform = inject(PlatformService);
  protected readonly diagnostics = inject(NetworkDiagnosticsService);
  protected readonly history = inject(NetworkRunHistoryService);
  protected readonly target = signal('');
  protected readonly secondTarget = signal('');
  protected readonly port = signal(443);
  protected readonly ports = signal('22,80,443,3389,8080');
  protected readonly protocol = signal<ScanProtocol>('tcp');
  protected readonly family = signal<AddressFamily>('auto');
  protected readonly recordType = signal<DnsRecordType>('A');
  protected readonly transport = signal<DnsTransport>('classic');
  protected readonly resolver = signal('');
  protected readonly localView = signal<LocalView>('ports');
  protected readonly count = signal(20);
  protected readonly durationMinutes = signal(5);
  protected readonly method = signal('HEAD');
  protected readonly connectivityMode = signal<'http' | 'tcp'>('http');
  protected readonly selectedChecks = signal<readonly ('local' | 'dns' | 'ping' | 'trace' | 'tcp' | 'scan')[]>(['local', 'dns', 'ping', 'trace', 'tcp', 'scan']);
  protected readonly headers = signal('');
  protected readonly body = signal('');
  protected readonly includeScan = signal(true);
  protected readonly preview = signal<{ request: NetworkRequest; token: string; details: unknown } | null>(null);
  protected readonly running = signal(false);
  protected readonly elevation = inject(ElevationService);
  protected readonly isAdmin = computed(() => this.elevation.elevated() === true);
  protected readonly adminPrompt = signal(false);
  protected readonly progress = signal<{ completed: number; total: number } | null>(null);
  protected readonly samples = signal<unknown[]>([]);
  protected readonly result = signal<unknown>(null);
  protected readonly error = signal('');
  protected readonly latestRun = signal<NetworkRun | null>(null);
  protected readonly selectedRunIds = signal<readonly string[]>([]);
  protected readonly includeHttpBodies = signal(false);
  protected readonly exportPreview = signal<{ ids: readonly string[]; fields: unknown } | null>(null);
  protected readonly showRaw = signal(false);
  protected readonly contacting = computed(() => {
    try { return describeContacts(this.composeRequest()); } catch { return []; }
  });
  private readonly shownRequest = signal<NetworkRequest | null>(null);
  protected readonly resultContext = computed<NetworkResultContext>(() => ({ $implicit: this.result(), request: this.shownRequest(), runId: this.latestRun()?.id ?? null }));
  protected readonly formattedResult = computed(() => this.result() === null ? '' : JSON.stringify(this.stripBody(this.result()), null, 2));
  protected readonly availableRuns = computed(() => {
    const runs = [...this.diagnostics.runs(), ...this.history.saved()];
    return runs.filter((run, index) => runs.findIndex((other) => other.id === run.id) === index);
  });
  protected readonly scanCount = computed(() => {
    const ports = this.parsePorts();
    const target = this.target().trim();
    const hosts = target.includes('/') ? 'up to 16' : '1';
    return `${hosts} hosts × ${ports.length} ports × ${this.protocol() === 'both' ? 2 : 1} protocols`;
  });
  protected readonly graphPoints = computed(() => {
    const values = this.samples().flatMap((sample, index) => {
      const ms = (sample as { rttMs?: unknown })?.rttMs;
      return typeof ms === 'number' ? [{ index, ms }] : [];
    });
    if (!values.length) return '';
    const max = Math.max(10, ...values.map((value) => value.ms));
    const denominator = Math.max(1, this.samples().length - 1);
    return values.map(({ index, ms }) => `${Math.round(index * 600 / denominator)},${Math.round(100 - ms * 90 / max)}`).join(' ');
  });
  private jobId: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private activeRequest: NetworkRequest | null = null;
  private destroyed = false;

  ngOnInit(): void { if (this.kind() === 'ping') this.count.set(4); if (this.platform.isDesktop() && this.kind() === 'local-network') void this.elevation.refresh(); }
  ngOnDestroy(): void { this.destroyed = true; if (this.jobId) void this.diagnostics.cancel(this.jobId); this.unsubscribe?.(); }
  protected setText(field: 'target' | 'secondTarget' | 'ports' | 'resolver' | 'method' | 'headers' | 'body', event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
    this[field].set(value);
    this.preview.set(null);
  }
  protected setNumber(field: 'port' | 'count' | 'durationMinutes', event: Event): void {
    this[field].set(Number((event.target as HTMLInputElement).value)); this.preview.set(null);
  }
  protected setChoice(field: 'protocol' | 'family' | 'recordType' | 'transport' | 'localView' | 'connectivityMode', event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (field === 'protocol') this.protocol.set(value as ScanProtocol);
    else if (field === 'family') this.family.set(value as AddressFamily);
    else if (field === 'recordType') this.recordType.set(value as DnsRecordType);
    else if (field === 'transport') this.transport.set(value as DnsTransport);
    else if (field === 'localView') this.localView.set(value as LocalView);
    else this.connectivityMode.set(value as 'http' | 'tcp');
    this.preview.set(null);
  }
  protected toggleCheck(check: 'local' | 'dns' | 'ping' | 'trace' | 'tcp' | 'scan', event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.selectedChecks.update((checks) => selected ? [...checks, check] : checks.filter((value) => value !== check));
    this.preview.set(null);
  }
  protected toggleScan(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.includeScan.set(enabled);
    this.selectedChecks.update((checks) => enabled ? checks.includes('scan') ? checks : [...checks, 'scan'] : checks.filter((check) => check !== 'scan'));
    this.preview.set(null);
  }
  private parsePorts(): number[] { return this.ports().split(/[\s,]+/).filter(Boolean).map(Number); }
  private parseHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    for (const line of this.headers().split(/\r?\n/).filter(Boolean)) {
      const separator = line.indexOf(':');
      if (separator < 1) throw new Error('Each HTTP header must use Name: value.');
      headers[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
    return headers;
  }
  private composeRequest(): NetworkRequest {
    const custom = this.buildRequest();
    return custom ? custom() : this.genericRequest();
  }
  private genericRequest(): NetworkRequest {
    const kind = this.kind();
    const request: NetworkRequest = {
      kind,
      target: this.target().trim(),
      secondTarget: this.secondTarget().trim() || undefined,
      addressFamily: this.family(),
      ...(kind === 'tcp-port-tester' || kind === 'udp-port-tester' || (kind === 'connectivity-tester' && this.connectivityMode() === 'tcp') ? { port: this.port() } : {}),
      ...(kind === 'port-scanner' || kind === 'network-diagnostic-bundle' ? { ports: this.parsePorts(), protocol: this.protocol(), includeScan: kind === 'port-scanner' || this.includeScan(), selectedChecks: kind === 'network-diagnostic-bundle' ? this.selectedChecks() : undefined } : {}),
      ...(kind === 'dns-lookup' || kind === 'dns-propagation' || kind === 'reverse-dns' ? { recordType: this.recordType(), resolver: this.resolver().trim() || undefined, resolverTransport: this.transport() } : {}),
      ...(kind === 'local-network' ? { localView: this.localView() } : {}),
      ...(kind === 'whois-lookup' ? { resolver: this.resolver().trim() || undefined } : {}),
      ...(kind === 'packet-loss' || kind === 'ping' ? { count: this.count() } : {}),
      ...(kind === 'latency-monitor' ? { durationMs: this.durationMinutes() * 60_000, intervalMs: 1000 } : {}),
      ...(kind === 'connectivity-tester' ? { connectivityMode: this.connectivityMode(), ...(this.connectivityMode() === 'http' ? { method: this.method().toUpperCase(), headers: this.parseHeaders(), body: this.body() } : {}) } : {}),
    };
    return request;
  }
  protected async run(): Promise<void> {
    if (!this.platform.isDesktop() || this.running()) return;
    this.error.set('');
    let request: NetworkRequest;
    try { request = this.composeRequest(); }
    catch (error) { this.error.set(String(error)); return; }
    if (needsReview(request)) {
      try { const staged = await this.diagnostics.prepare(request); this.preview.set({ request, token: staged.token, details: staged.preview }); }
      catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
      return;
    }
    this.preview.set(null);
    this.running.set(true); this.result.set(null); this.samples.set([]); this.progress.set(null);
    this.activeRequest = request;
    try {
      const handle = await this.diagnostics.start(request, (event) => this.onEvent(event));
      if (this.destroyed) { void this.diagnostics.cancel(handle.jobId); handle.unsubscribe(); }
      else if (this.running()) { this.jobId = handle.jobId; this.unsubscribe = handle.unsubscribe; }
      else handle.unsubscribe();
    } catch (error) { this.running.set(false); this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  protected async confirm(): Promise<void> {
    const pending = this.preview();
    if (!pending) return;
    const { request, token } = pending;
    this.preview.set(null);
    this.running.set(true); this.result.set(null); this.samples.set([]); this.progress.set(null);
    this.activeRequest = request;
    try { const handle = await this.diagnostics.start(request, (event) => this.onEvent(event), token); if (this.destroyed) { void this.diagnostics.cancel(handle.jobId); handle.unsubscribe(); } else if (this.running()) { this.jobId = handle.jobId; this.unsubscribe = handle.unsubscribe; } else handle.unsubscribe(); }
    catch (error) { this.running.set(false); this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  protected cancelPreview(): void { this.preview.set(null); }
  protected stop(): void { if (this.jobId) void this.diagnostics.cancel(this.jobId); }
  private onEvent(event: NetworkJobEvent): void {
    if (event.type === 'progress') {
      this.progress.set({ completed: event.completed ?? 0, total: event.total ?? 0 });
      if (event.data !== undefined) this.samples.update((samples) => [...samples.slice(-3599), event.data]);
    } else if (event.type === 'result') {
      this.result.set(event.data);
      this.shownRequest.set(this.activeRequest);
      if (this.activeRequest) {
        const run = this.diagnostics.addRun(this.activeRequest, event.data);
        this.latestRun.set(run);
        this.resultChange.emit({ result: event.data, request: this.activeRequest, runId: run.id });
      }
    } else if (event.type === 'error') this.error.set(event.message ?? 'Network check failed.');
    else { this.running.set(false); this.jobId = null; this.unsubscribe?.(); this.unsubscribe = null; }
  }
  protected async relaunchAdmin(): Promise<void> {
    this.adminPrompt.set(false);
    try {
      const accepted = await this.elevation.relaunch();
      if (!accepted) this.error.set('Administrator relaunch was declined. Current session is unchanged.');
    } catch (error) { this.error.set(error instanceof Error ? error.message : String(error)); }
  }
  protected saveLatest(): void { const run = this.latestRun(); if (run) void this.history.save(run); }
  protected restoreRun(run: NetworkRun): void { this.result.set(run.result); this.shownRequest.set(run.request); this.latestRun.set(null); this.error.set(''); }
  protected compareSelected(): void {
    const selected = this.availableRuns().filter((run) => this.selectedRunIds().includes(run.id) && run.request.kind === 'traceroute');
    if (selected.length !== 2) { this.error.set('Select exactly two traceroute runs.'); return; }
    const before = ((selected[0].result as { hops?: { address?: string; status?: string }[] })?.hops ?? []);
    const after = ((selected[1].result as { hops?: { address?: string; status?: string }[] })?.hops ?? []);
    const changedHops = Array.from({ length: Math.max(before.length, after.length) }, (_, index) =>
      ({ hop: index + 1, before: before[index] ?? null, after: after[index] ?? null }))
      .filter(({ before: a, after: b }) => a?.address !== b?.address || a?.status !== b?.status);
    this.result.set({ first: selected[0], second: selected[1], changedHops });
  }
  protected copy(): void { void navigator.clipboard.writeText(this.formattedResult()); }
  protected downloadResponse(): void {
    const body = (this.result() as { bodyBase64?: string })?.bodyBase64;
    if (!body) return;
    const bytes = Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
    downloadFile(bytes, 'network-response.bin');
  }
  protected selectRun(id: string, event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.selectedRunIds.update((ids) => selected ? [...ids, id] : ids.filter((value) => value !== id));
    this.exportPreview.set(null);
  }
  protected toggleHttpBodies(event: Event): void {
    this.includeHttpBodies.set((event.target as HTMLInputElement).checked);
    this.exportPreview.set(null);
  }
  protected exportBundle(): void {
    const selected = this.availableRuns().filter((run) => this.selectedRunIds().includes(run.id));
    if (!selected.length) { this.error.set('Select at least one run.'); return; }
    this.error.set('');
    this.exportPreview.set({
      ids: selected.map((run) => run.id),
      fields: selected.map((run) => ({
        kind: run.request.kind, target: run.request.target ?? 'local machine', createdAt: run.createdAt,
        resultFields: run.result && typeof run.result === 'object' ? Object.keys(run.result) : [],
        httpBody: this.includeHttpBodies() && !!this.diagnostics.responseBody(run.id),
      })),
    });
  }
  protected confirmExport(): void {
    const reviewed = this.exportPreview();
    if (!reviewed) return;
    const selected = this.availableRuns().filter((run) => reviewed.ids.includes(run.id));
    if (selected.length !== reviewed.ids.length) { this.exportPreview.set(null); this.error.set('Selection changed. Review it again.'); return; }
    downloadFile(buildNetworkBundle(selected, (id) => this.diagnostics.responseBody(id), this.includeHttpBodies()), 'dude-network-diagnostics.zip', 'application/zip');
    this.exportPreview.set(null);
  }
  private stripBody(result: unknown): unknown {
    if (!result || typeof result !== 'object') return result;
    const copy = { ...result as Record<string, unknown> };
    delete copy['bodyBase64'];
    return copy;
  }
}
