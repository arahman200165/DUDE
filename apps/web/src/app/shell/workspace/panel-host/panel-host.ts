import { Component, forwardRef, inject, input } from '@angular/core';
import { PanelNode } from "@dude/domain/core/workspace/workspace.model";
import { WorkspaceLayoutService } from '../../../core/workspace/workspace-layout.service';
import { SplitPane } from '../../../shared/components/split-pane/split-pane';
import { ToolHost } from '../tool-host/tool-host';

/**
 * Recurses over a `PanelNode` tree: a `leaf` renders one `ToolHost`, a `split` renders two nested
 * `PanelHost`s inside `SplitPane` (`shared/components/split-pane/`) — arbitrary depth by
 * construction, no new resize engine written. `forwardRef` is the standard Angular pattern for a
 * standalone component that recursively imports itself in its own template.
 */
@Component({
  selector: 'app-panel-host',
  imports: [ToolHost, SplitPane, forwardRef(() => PanelHost)],
  templateUrl: './panel-host.html',
})
export class PanelHost {
  private readonly layout = inject(WorkspaceLayoutService);

  readonly node = input.required<PanelNode>();

  protected onRatioChange(nodeId: string, ratio: number): void {
    this.layout.setSplitRatio(nodeId, ratio);
  }
}
