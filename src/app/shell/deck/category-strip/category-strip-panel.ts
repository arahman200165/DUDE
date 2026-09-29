import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CategoryStrip } from './category-strip';

/** "Browse Tools" heading, the explicit "Browse all tools →" entry point, and the category strip. */
@Component({
  selector: 'app-category-strip-panel',
  imports: [RouterLink, CategoryStrip],
  template: `
    <div class="mb-2 flex items-center justify-between">
      <h2 class="text-ui-sm font-semibold uppercase tracking-wider text-text-muted">Browse Tools</h2>
      <a routerLink="/tools" class="text-ui-xs text-text-muted hover:text-accent">Browse all tools →</a>
    </div>
    <app-category-strip />
  `,
})
export class CategoryStripPanel {}
