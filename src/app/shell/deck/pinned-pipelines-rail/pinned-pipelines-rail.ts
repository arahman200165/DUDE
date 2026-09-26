import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Pipeline } from '../../../core/pipeline/pipeline.model';

/**
 * Mirrors `HomeRail`, but for `Pipeline` cards — a separate small component rather than forcing a
 * `Pipeline` through `HomeRail`'s `ToolDefinition`-shaped input, since the two types don't share a
 * category/route shape worth abstracting over for one call site (DUDE_PRD.md §21 Phase 24 Item 8).
 */
@Component({
  selector: 'app-pinned-pipelines-rail',
  imports: [RouterLink],
  templateUrl: './pinned-pipelines-rail.html',
})
export class PinnedPipelinesRail {
  readonly pipelines = input.required<readonly Pipeline[]>();
}
