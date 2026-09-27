import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { BusyIndicator, BusyIndicatorStatus } from '../../shared/components/busy-indicator/busy-indicator';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { OpenTextFile } from '../../shared/components/open-text-file/open-text-file';
import { TextFileDrop } from '../../shared/components/open-text-file/text-file-drop.directive';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { validateAgainstXsd, XsdValidateResult } from './xsd-validate';

@Component({
  selector: 'app-xml-xsd-validator',
  imports: [ToolShell, BusyIndicator, ErrorPanel, OpenTextFile, TextFileDrop],
  templateUrl: './xml-xsd-validator.html',
})
export class XmlXsdValidator {
  private readonly persistence = inject(PersistenceService);

  protected readonly xmlInput = this.persistence.signal('xml-xsd-validator', 'xmlInput', 'session', '');
  protected readonly xsdInput = this.persistence.signal('xml-xsd-validator', 'xsdInput', 'session', '');

  protected readonly status = signal<'idle' | 'validating' | 'done'>('idle');
  protected readonly result = signal<XsdValidateResult | null>(null);

  protected readonly busyStatus = computed<BusyIndicatorStatus>(() => {
    if (this.status() === 'validating') return 'running';
    const current = this.result();
    if (!current) return 'idle';
    if (!current.ok) return 'error';
    return current.valid ? 'done' : 'error';
  });

  protected onXmlInputChange(event: Event): void {
    this.xmlInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected onXsdInputChange(event: Event): void {
    this.xsdInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected async validate(): Promise<void> {
    this.status.set('validating');
    const result = await validateAgainstXsd(this.xmlInput(), this.xsdInput());
    this.result.set(result);
    this.status.set('done');
  }

  protected clear(): void {
    this.xmlInput.set('');
    this.xsdInput.set('');
    this.result.set(null);
    this.status.set('idle');
  }
}
