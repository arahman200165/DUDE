import { Injectable, Provider, inject } from '@angular/core';
import { COMMAND_SOURCE, CommandSource, PaletteCommand } from '../../shared/models/command-source.model';
import { WorkspaceTemplateService } from './workspace-template.service';
import { WorkspaceLayoutService } from './workspace-layout.service';

/**
 * Command Palette source for Workspace Templates (DUDE_PRD.md §21 Phase 25 Item 4) -- an "apply"
 * command per template plus one "save current layout" command. Applying a template through the
 * palette mirrors `TemplateGallery.apply()`'s confirm-before-replacing-a-non-empty-layout precedent
 * exactly, since this is a third call site (after the gallery and Deck's `RecentWorkspacesRail`) for
 * the same non-destructive-but-disruptive action.
 */
@Injectable()
export class WorkspaceCommandSource implements CommandSource {
  private readonly templateStore = inject(WorkspaceTemplateService);
  private readonly workspaceLayout = inject(WorkspaceLayoutService);

  commands(): readonly PaletteCommand[] {
    const applyCommands: PaletteCommand[] = this.templateStore.templates().map((template) => ({
      id: `workspace:apply:${template.id}`,
      kind: 'workspace' as const,
      title: `Apply Workspace: ${template.name}`,
      description: template.description,
      execute: () => {
        if (this.workspaceLayout.panelTree() !== null && !confirm(`Replace your current workspace layout with "${template.name}"?`)) return;
        this.templateStore.apply(template);
      },
    }));

    const saveCommand: PaletteCommand = {
      id: 'workspace:save-current',
      kind: 'workspace',
      title: 'Save Current Workspace as Template…',
      execute: () => {
        const name = prompt('Name for the new workspace template:')?.trim();
        if (name) this.templateStore.saveCurrentAsTemplate(name);
      },
    };

    return [...applyCommands, saveCommand];
  }
}

export const WORKSPACE_COMMAND_SOURCE_PROVIDERS: Provider[] = [
  WorkspaceCommandSource,
  { provide: COMMAND_SOURCE, useExisting: WorkspaceCommandSource, multi: true },
];
