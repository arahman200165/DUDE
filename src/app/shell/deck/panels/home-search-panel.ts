import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ShortcutHint } from '../../../shared/components/shortcut-hint/shortcut-hint';
import { CommandPaletteService } from '../../command-palette/command-palette.service';

/**
 * Home's compact search + "Jump to…" row. Search hands off to Browse Tools' own filtering and
 * query syntax rather than re-deriving a second implementation (DUDE_PRD.md Phase 30D.1); the typed
 * text is never persisted (Phase 30I.3).
 */
@Component({
  selector: 'app-home-search-panel',
  imports: [ShortcutHint],
  templateUrl: './home-search-panel.html',
})
export class HomeSearchPanel {
  private readonly router = inject(Router);
  protected readonly paletteService = inject(CommandPaletteService);
  protected readonly query = signal('');

  protected onQueryInput(event: Event): void {
    this.query.set((event.target as HTMLInputElement).value);
  }

  protected search(): void {
    const trimmed = this.query().trim();
    void this.router.navigate(['/tools'], trimmed ? { queryParams: { q: trimmed } } : {});
  }
}
