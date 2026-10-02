import { toDateTimeLocalValue } from "@dude/tool-engine/tools/epoch-timeline-visualizer/epoch-timeline-visualizer.embedded-engine";
import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { Timeline } from '../../shared/components/timeline/timeline';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { buildRangeMarkers, parseMultiTimestamps } from "@dude/tool-engine/tools/epoch-timeline-visualizer/epoch-timeline-visualizer-logic";

type VisualizerMode = 'multi' | 'range';


@Component({
  selector: 'app-epoch-timeline-visualizer',
  imports: [ToolShell, ErrorPanel, Timeline],
  templateUrl: './epoch-timeline-visualizer.html',
})
export class EpochTimelineVisualizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<VisualizerMode>('epoch-timeline-visualizer', 'mode', 'local', 'multi');
  protected readonly includeNow = this.persistence.signal('epoch-timeline-visualizer', 'includeNow', 'local', true);

  protected readonly multiText = this.persistence.signal(
    'epoch-timeline-visualizer',
    'multiText',
    'session',
    '1700000000 | Launch\n1700604800 | Beta\n1701820800 | GA',
  );

  protected readonly rangeStart = this.persistence.signal('epoch-timeline-visualizer', 'rangeStart', 'session', toDateTimeLocalValue(new Date()));
  protected readonly rangeEnd = this.persistence.signal(
    'epoch-timeline-visualizer',
    'rangeEnd',
    'session',
    toDateTimeLocalValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );

  private readonly nowMs = signal(Date.now());

  protected readonly result = computed(() => {
    if (this.mode() === 'multi') {
      return parseMultiTimestamps(this.multiText(), this.includeNow(), this.nowMs());
    }

    const startMs = new Date(this.rangeStart()).getTime();
    const endMs = new Date(this.rangeEnd()).getTime();
    return buildRangeMarkers({ startMs, endMs, includeNow: this.includeNow(), nowMs: this.nowMs() });
  });

  protected setMode(mode: VisualizerMode): void {
    this.mode.set(mode);
  }

  protected onMultiTextChange(event: Event): void {
    this.multiText.set((event.target as HTMLTextAreaElement).value);
  }

  protected onRangeStartChange(event: Event): void {
    this.rangeStart.set((event.target as HTMLInputElement).value);
  }

  protected onRangeEndChange(event: Event): void {
    this.rangeEnd.set((event.target as HTMLInputElement).value);
  }

  protected onIncludeNowChange(event: Event): void {
    this.includeNow.set((event.target as HTMLInputElement).checked);
  }
}
