import { Component, computed, input } from '@angular/core';
import { TimelineMarkerInput, buildTicks, positionMarkers } from "@dude/tool-engine/shared/components/timeline/timeline-layout";

/**
 * Reusable proportionally-scaled horizontal timeline: plots arbitrary
 * epoch-millisecond markers along a [rangeStartMs, rangeEndMs] axis with
 * evenly-spaced date/time tick labels. Presentational only, like
 * `app-data-table` — a tool computes its own markers/range and passes them in.
 */
@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.html',
})
export class Timeline {
  readonly markers = input.required<readonly TimelineMarkerInput[]>();
  readonly rangeStartMs = input.required<number>();
  readonly rangeEndMs = input.required<number>();

  protected readonly positionedMarkers = computed(() => positionMarkers(this.markers(), this.rangeStartMs(), this.rangeEndMs()));
  protected readonly ticks = computed(() => buildTicks(this.rangeStartMs(), this.rangeEndMs()));
}
