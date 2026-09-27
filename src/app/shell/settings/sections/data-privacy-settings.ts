import { Component, inject, signal } from '@angular/core';
import { ClearAllDataService } from '../../../core/workspace/clear-all-data';

/**
 * Settings › Data & Privacy — the one home of "Clear all local data" (formerly also a sidebar
 * footer button). Works on web and desktop alike.
 */
@Component({
  selector: 'app-data-privacy-settings',
  templateUrl: './data-privacy-settings.html',
})
export class DataPrivacySettings {
  private readonly clearAllData = inject(ClearAllDataService);
  protected readonly status = signal<'idle' | 'cleared'>('idle');

  protected async onClearAllLocalData(): Promise<void> {
    if (!confirm('Clear all saved DUDE data from this browser? This cannot be undone.')) return;
    await this.clearAllData.clearAll();
    this.status.set('cleared');
  }
}
