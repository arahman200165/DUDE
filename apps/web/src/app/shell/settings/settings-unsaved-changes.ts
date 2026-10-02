import { CanDeactivateFn } from '@angular/router';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * Which Settings sections currently hold unsaved drafts (AI provider fields, hotkey drafts — the
 * sections with an explicit Save). Sections report through `setDirty`; the route guard below asks
 * before navigating away (switching section or leaving Settings) while any are dirty.
 */
@Injectable({ providedIn: 'root' })
export class SettingsUnsavedChanges {
  private readonly dirtySections = signal<ReadonlySet<string>>(new Set());
  readonly hasUnsavedChanges = computed(() => this.dirtySections().size > 0);

  setDirty(sectionId: string, dirty: boolean): void {
    this.dirtySections.update((current) => {
      if (current.has(sectionId) === dirty) return current;
      const next = new Set(current);
      if (dirty) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
  }

  discardAll(): void {
    this.dirtySections.set(new Set());
  }
}

export const settingsUnsavedChangesGuard: CanDeactivateFn<unknown> = () => {
  const unsaved = inject(SettingsUnsavedChanges);
  if (!unsaved.hasUnsavedChanges()) return true;
  if (!confirm('You have unsaved Settings changes. Leave without saving?')) return false;
  unsaved.discardAll();
  return true;
};
