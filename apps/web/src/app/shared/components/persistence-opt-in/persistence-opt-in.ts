import { Component, computed, inject, input } from '@angular/core';
import { PersistenceService } from '../../../core/persistence/persistence.service';

@Component({
  selector: 'app-persistence-opt-in',
  templateUrl: './persistence-opt-in.html',
})
export class PersistenceOptIn {
  private readonly persistence = inject(PersistenceService);

  readonly toolId = input.required<string>();
  readonly key = input.required<string>();
  readonly label = input<string>('Remember on this device');

  protected readonly checked = computed(() => this.persistence.hasConsent(this.toolId(), this.key()));

  protected onToggle(event: Event): void {
    const granted = (event.target as HTMLInputElement).checked;
    this.persistence.setConsent(this.toolId(), this.key(), granted);
  }
}
