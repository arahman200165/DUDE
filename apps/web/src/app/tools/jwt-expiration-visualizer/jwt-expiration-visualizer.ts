import { JwtExpirationVisualizer_statusLabel, JwtExpirationVisualizer_statusClasses, JwtExpirationVisualizer_barFillClasses, JwtExpirationVisualizer_formatDuration } from "@dude/tool-engine/tools/jwt-expiration-visualizer/jwt-expiration-visualizer.embedded-engine";
import { Component, computed, inject } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { decodeJwt } from "@dude/tool-engine/tools/jwt/jwt-decode";
import { JwtTimelineStatus, buildTimeline } from "@dude/tool-engine/tools/jwt-expiration-visualizer/jwt-expiration-visualizer-logic";

@Component({
  selector: 'app-jwt-expiration-visualizer',
  imports: [ToolShell, ErrorPanel, DecimalPipe],
  templateUrl: './jwt-expiration-visualizer.html',
})
export class JwtExpirationVisualizer {
  private readonly persistence = inject(PersistenceService);

  protected readonly input = this.persistence.signal('jwt-expiration-visualizer', 'input', 'none', '');

  protected readonly decoded = computed(() => decodeJwt(this.input()));
  protected readonly timelineResult = computed(() => {
    const current = this.decoded();
    return current.ok ? buildTimeline(current.payload) : null;
  });

  protected onInputChange(event: Event): void {
    this.input.set((event.target as HTMLTextAreaElement).value);
  }

  protected clear(): void {
    this.input.set('');
  }
  protected statusLabel = JwtExpirationVisualizer_statusLabel;

  protected statusClasses = JwtExpirationVisualizer_statusClasses;

  protected barFillClasses = JwtExpirationVisualizer_barFillClasses;

  protected formatDuration = JwtExpirationVisualizer_formatDuration;

}
