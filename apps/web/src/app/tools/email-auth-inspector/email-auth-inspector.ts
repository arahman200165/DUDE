import { EmailAuthInspectorTool_view, EmailAuthInspectorTool_tagEntries, EmailAuthInspectorTool_qualifierClass } from "@dude/tool-engine/tools/email-auth-inspector/email-auth-inspector.embedded-engine";
import { NgTemplateOutlet } from '@angular/common';
import { Component, signal } from '@angular/core';
import { NetworkWorkbench } from '../../shared/components/network-workbench/network-workbench';
import { DesktopOnlyControl } from '../../shared/components/desktop-only-control/desktop-only-control';
import { FindingsList, type Finding } from '../../shared/components/findings-list/findings-list';
import type { DnsTransport, EmailAuthCheck, NetworkRequest } from "@dude/contracts/core/platform/network-types";
import type { EmailAuthView } from "@dude/contracts/core/platform/network-live-types";

type Tab = 'spf' | 'dkim' | 'dmarc';

/**
 * Email Auth Inspector (Phase 28 items 4–6: SPF, DKIM, DMARC as tabs of one run). Pasted
 * headers are parsed in the main process only to derive `<s>._domainkey.<d>` lookups; they are
 * never stored in run history (`network-diagnostics.service.ts` strips `dkimHeaders`).
 */
@Component({
  selector: 'app-email-auth-inspector',
  imports: [NetworkWorkbench, DesktopOnlyControl, FindingsList, NgTemplateOutlet],
  templateUrl: './email-auth-inspector.html',
})
export class EmailAuthInspectorTool {
  protected readonly domain = signal('');
  protected readonly checks = signal<readonly EmailAuthCheck[]>(['spf', 'dkim', 'dmarc']);
  protected readonly senderIp = signal('');
  protected readonly selectors = signal('');
  protected readonly headers = signal('');
  protected readonly commonProbe = signal(false);
  protected readonly transport = signal<DnsTransport>('classic');
  protected readonly resolver = signal('');
  protected readonly tab = signal<Tab>('spf');

  protected readonly build = (): NetworkRequest => ({
    kind: 'email-auth', target: this.domain().trim(), emailChecks: this.checks(), resolverTransport: this.transport(),
    ...(this.resolver().trim() ? { resolver: this.resolver().trim() } : {}),
    ...(this.senderIp().trim() ? { senderIp: this.senderIp().trim() } : {}),
    ...(this.checks().includes('dkim') ? {
      dkimSelectors: this.selectors().split(/[\s,]+/).map((value) => value.trim()).filter(Boolean),
      ...(this.headers().trim() ? { dkimHeaders: this.headers() } : {}),
      ...(this.commonProbe() ? { dkimCommonProbe: true } : {}),
    } : {}),
  });

  protected text(field: 'domain' | 'senderIp' | 'selectors' | 'headers' | 'resolver', event: Event): void { this[field].set((event.target as HTMLInputElement).value); }
  protected toggleCheck(check: EmailAuthCheck, event: Event): void {
    const on = (event.target as HTMLInputElement).checked;
    this.checks.update((list) => on ? [...list.filter((value) => value !== check), check] : list.filter((value) => value !== check));
  }
  protected setProbe(event: Event): void { this.commonProbe.set((event.target as HTMLInputElement).checked); }
  protected setTransport(event: Event): void { this.transport.set((event.target as HTMLSelectElement).value as DnsTransport); }
  protected view = EmailAuthInspectorTool_view;

  protected dkimFindings(view: EmailAuthView): readonly Finding[] { return view.dkim?.keys.flatMap((key) => key.findings.map((finding) => ({ ...finding, title: `${key.selector}: ${finding.title}` }))) ?? []; }
  protected tagEntries = EmailAuthInspectorTool_tagEntries;

  protected qualifierClass = EmailAuthInspectorTool_qualifierClass;

}
