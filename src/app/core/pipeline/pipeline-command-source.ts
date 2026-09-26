import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { PipelineStoreService } from './pipeline-store.service';

/**
 * Command Palette source for saved Pipelines (DUDE_PRD.md §21 Phase 25 Item 4) -- navigate-only in
 * this phase (opens the builder at `/pipelines/:id`, never runs it). Upgrading to a direct `execute`
 * that actually runs the pipeline is deferred until it can go through
 * `PipelineConfirmationService`'s gate (M426) -- see the item's own note in the roadmap.
 */
@Injectable()
export class PipelineCommandSource implements CommandSource {
  private readonly router = inject(Router);
  private readonly pipelineStore = inject(PipelineStoreService);

  commands(): readonly PaletteCommand[] {
    return this.pipelineStore.pipelines().map((pipeline) => ({
      id: `pipeline:open:${pipeline.id}`,
      kind: 'pipeline' as const,
      title: `Pipeline: ${pipeline.name}`,
      execute: () => void this.router.navigate(['/pipelines', pipeline.id]),
    }));
  }
}

export const PIPELINE_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  PipelineCommandSource,
  { provide: COMMAND_SOURCE, useExisting: PipelineCommandSource, multi: true },
];
