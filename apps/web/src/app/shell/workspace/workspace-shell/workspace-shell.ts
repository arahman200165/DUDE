import { Component, inject } from '@angular/core';
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { CommandPaletteService } from '../../command-palette/command-palette.service';
import { TabStrip } from '../tab-strip/tab-strip';
import { PanelHost } from '../panel-host/panel-host';
import { ScratchpadDrawer } from '../scratchpad-drawer/scratchpad-drawer';
import { TemplateGallery } from '../template-gallery/template-gallery';
import { ShortcutHint } from '../../../shared/components/shortcut-hint/shortcut-hint';

/**
 * `/workspace` route root (DUDE_PRD.md §21 Phase 21 Item 4) — a sanctioned exception to
 * "nothing in shell/ hard-codes a tool ID", the third after `pipelines/`/`smart-paste/`. See
 * `shell/workspace/AGENTS.md`. `TemplateGallery` (Phase 24 Item 11) extends this same exception.
 */
@Component({
  selector: 'app-workspace-shell',
  imports: [TabStrip, PanelHost, ScratchpadDrawer, TemplateGallery, ShortcutHint],
  templateUrl: './workspace-shell.html',
})
export class WorkspaceShell {
  protected readonly layout = inject(WorkspaceLayoutService);
  private readonly paletteService = inject(CommandPaletteService);

  protected openPicker(): void {
    this.paletteService.open();
  }
}
