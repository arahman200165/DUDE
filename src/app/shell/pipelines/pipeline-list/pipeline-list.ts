import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PipelineStoreService } from '../../../core/pipeline/pipeline-store.service';
import { FavoritesService } from '../../../core/favorites/favorites.service';

@Component({
  selector: 'app-pipeline-list',
  imports: [RouterLink],
  templateUrl: './pipeline-list.html',
})
export class PipelineList {
  private readonly store = inject(PipelineStoreService);
  private readonly router = inject(Router);
  protected readonly favorites = inject(FavoritesService);

  protected readonly pipelines = this.store.pipelines;

  protected togglePin(id: string): void {
    this.favorites.togglePipeline(id);
  }

  protected duplicate(id: string): void {
    const copy = this.store.duplicate(id);
    if (copy) void this.router.navigate(['/pipelines', copy.id]);
  }

  protected remove(id: string, name: string): void {
    if (confirm(`Delete pipeline "${name}"? This cannot be undone.`)) {
      this.store.remove(id);
    }
  }
}
