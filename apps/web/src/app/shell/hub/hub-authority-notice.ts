import { Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import type { HubAuthorityBlock } from '../../core/hub-web/hub-web-authority';
import { HubCard } from './hub-card';

/**
 * Full-page blocking notice of the Hub authority gate (PD-071), used both before the app starts (the boot gate) and over a
 * running page that learned its Hub was transferred. It replaces the sign-in page and the app: nothing behind it can be used,
 * and it makes no Hub call itself (the host decides what "Check again" and "Forget" do).
 */
@Component({
  selector: 'app-hub-authority-notice',
  imports: [HubCard],
  template: `
    <div class="fixed inset-0 z-[100] overflow-auto bg-bg" role="alertdialog" aria-modal="true" aria-labelledby="hub-card-title" data-testid="hub-authority-notice">
      @if (block().kind === 'transferred') {
        <app-hub-card heading="This Hub was moved">
          <p class="text-ui text-text" data-testid="notice-text">
            This Hub was transferred to another machine and is now read-only. Open the new Hub's address to continue. Nothing on this page can change data here.
          </p>
          <div class="flex items-center gap-4">
            <button #primary type="button" data-testid="check-again" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent" (click)="checkAgain.emit()">Check again</button>
          </div>
        </app-hub-card>
      } @else {
        <app-hub-card heading="This Hub is older than the one this browser used before">
          <p class="text-ui text-text" data-testid="notice-text">
            This browser last used a Hub at authority epoch {{ storedEpoch() }}; the Hub at this address is at epoch {{ seenEpoch() }}.
            It may have been restored from an older backup, or you may be reaching a Hub that was replaced. Nothing is signed in until you choose.
          </p>
          <div class="flex flex-wrap items-center gap-4">
            <button #primary type="button" data-testid="forget" class="rounded-sm bg-accent px-3 py-1 text-ui font-semibold text-on-accent" (click)="forget.emit()">Forget the previous Hub and continue</button>
            <button type="button" data-testid="check-again" class="rounded-sm border border-border px-3 py-1 text-ui text-text" (click)="checkAgain.emit()">Check again</button>
          </div>
        </app-hub-card>
      }
    </div>
  `,
})
export class HubAuthorityNotice {
  readonly block = input.required<HubAuthorityBlock>();
  /** Re-run the authority gate. */
  readonly checkAgain = output<void>();
  /** Replace the stored Hub record with the one this page saw, then continue. */
  readonly forget = output<void>();

  private readonly primary = viewChild<ElementRef<HTMLButtonElement>>('primary');

  constructor() {
    afterNextRender(() => this.primary()?.nativeElement.focus());
  }

  protected storedEpoch(): number | null {
    const block = this.block();
    return block.kind === 'older' ? block.storedEpoch : null;
  }

  protected seenEpoch(): number | null {
    const block = this.block();
    return block.kind === 'older' ? block.seenEpoch : null;
  }
}
