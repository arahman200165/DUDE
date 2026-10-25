import { Component, computed, inject } from '@angular/core';
import { HubStepUpService } from '../hub/hub-step-up.service';
import { HubStepUpDialog } from '../../shared/components/hub-step-up-dialog/hub-step-up-dialog';
import { HubConflictDialog } from '../../shared/components/hub-conflict-dialog/hub-conflict-dialog';
import { HubWebFeedback } from './hub-web-feedback';

/**
 * Mounted once by `startHubWebRuntime` (outside the shell, so no shell file changes): the notices the Hub web sync
 * raises, the conflict dialog and the owner step-up prompt. Conflicts and prompts are shown one at a time, oldest first.
 */
@Component({
  selector: 'app-hub-web-overlay',
  imports: [HubConflictDialog, HubStepUpDialog],
  template: `
    @if (feedback.toasts().length > 0) {
      <div class="fixed bottom-4 left-4 z-50 flex max-w-lg flex-col gap-2" role="status" aria-live="polite">
        @for (toast of feedback.toasts(); track toast.id) {
          <div class="flex items-start gap-3 rounded-sm border bg-panel px-3 py-2 text-ui text-text shadow-lg"
            [class.border-error]="toast.kind === 'error'" [class.border-border]="toast.kind !== 'error'" data-testid="hub-toast">
            <span>{{ toast.text }}</span>
            <button type="button" class="ml-auto underline" (click)="feedback.dismiss(toast.id)">Dismiss</button>
          </div>
        }
      </div>
    }
    @if (feedback.conflicts()[0]; as conflict) {
      <app-hub-conflict-dialog [request]="conflict" (chosen)="conflict.resolve($event)" />
    }
    <!-- Keyed by request, so a re-ask after a refused password is a fresh dialog with an empty field. -->
    @for (request of stepUpRequest(); track request) {
      <app-hub-step-up-dialog [message]="request.message" (submitted)="request.resolve($event)" (cancelled)="request.resolve(null)" />
    }
  `,
})
export class HubWebOverlay {
  protected readonly feedback = inject(HubWebFeedback);
  private readonly stepUp = inject(HubStepUpService);
  protected readonly stepUpRequest = computed(() => {
    const request = this.stepUp.pending();
    return request === null ? [] : [request];
  });
}
