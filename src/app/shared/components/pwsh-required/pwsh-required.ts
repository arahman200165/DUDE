import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { PwshStatusService } from '../../../core/platform/pwsh-status.service';
import { CopyButton } from '../copy-button/copy-button';
import { StatusGlyph } from '../status-glyph/status-glyph';

/**
 * Gate for PowerShell-backed features: projects its content once PowerShell 7 is available, otherwise
 * shows what is missing, the install command, and a "Check again" action. Shows nothing while loading.
 */
@Component({
  selector: 'app-pwsh-required',
  imports: [CopyButton, StatusGlyph],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let current = pwsh.status();
    @if (current) {
      @if (current.available) {
        <ng-content />
      } @else {
        <div class="flex flex-col gap-2 rounded-sm border border-warning/50 bg-warning/5 p-3 text-ui" role="status">
          <p class="flex items-center gap-2 text-warning">
            <app-status-glyph kind="warning" />
            PowerShell 7 is required for {{ feature() }}.
          </p>
          @if (current.reason) { <p class="text-text-muted">{{ current.reason }}</p> }
          <div class="flex flex-wrap items-center gap-2">
            <code class="rounded-sm border border-border bg-panel px-1.5 py-0.5 font-mono text-text">{{ installCommand }}</code>
            <app-copy-button [text]="installCommand" />
            <button
              type="button"
              class="rounded-sm border border-border px-2 py-0.5 text-text hover:bg-panel-elevated focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              (click)="checkAgain()"
            >
              Check again
            </button>
          </div>
        </div>
      }
    }
  `,
})
export class PwshRequired implements OnInit {
  protected readonly pwsh = inject(PwshStatusService);
  readonly feature = input.required<string>();
  protected readonly installCommand = 'winget install --id Microsoft.PowerShell';

  ngOnInit(): void { void this.pwsh.ensureLoaded(); }

  protected checkAgain(): void { void this.pwsh.refresh(true); }
}
