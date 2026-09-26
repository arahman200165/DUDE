import { Injectable, Provider, inject } from '@angular/core';
import { Router } from '@angular/router';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { ProjectService } from './project.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';

/**
 * Command Palette source for Projects (DUDE_PRD.md §21 Phase 25 Item 4) -- one "Open Project: X"
 * command per project. Activating through the palette mirrors `ProjectList.activate()`'s
 * confirm-before-replacing-a-non-empty-layout precedent exactly.
 */
@Injectable()
export class ProjectCommandSource implements CommandSource {
  private readonly router = inject(Router);
  private readonly projectStore = inject(ProjectService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  commands(): readonly PaletteCommand[] {
    return this.projectStore.projects().map((project) => ({
      id: `project:open:${project.id}`,
      kind: 'project' as const,
      title: `Open Project: ${project.name}`,
      description: project.description,
      execute: () => {
        if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${project.name}"?`)) return;
        this.projectStore.activate(project.id);
        void this.router.navigateByUrl('/workspace');
      },
    }));
  }
}

export const PROJECT_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  ProjectCommandSource,
  { provide: COMMAND_SOURCE, useExisting: ProjectCommandSource, multi: true },
];
