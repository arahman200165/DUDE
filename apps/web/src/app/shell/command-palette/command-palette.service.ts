import { Injectable, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { Subject } from 'rxjs';
import { CommandPalette } from './command-palette';

@Injectable({ providedIn: 'root' })
export class CommandPaletteService {
  private readonly overlay = inject(Overlay);
  private overlayRef: OverlayRef | null = null;
  readonly closed = new Subject<'dismiss' | 'execute'>();

  open(): void {
    if (this.overlayRef) return;

    const overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'bg-bg/70',
      positionStrategy: this.overlay.position().global().centerHorizontally().top('15vh'),
      scrollStrategy: this.overlay.scrollStrategies.block(),
    });

    overlayRef.backdropClick().subscribe(() => this.close());
    const palette = overlayRef.attach(new ComponentPortal(CommandPalette));
    // Render now so the search input takes focus inside the opening keystroke; waiting for the
    // scheduled render drops whatever is typed or pressed (Escape) in the meantime.
    palette.changeDetectorRef.detectChanges();

    this.overlayRef = overlayRef;
  }

  close(reason: 'dismiss' | 'execute' = 'dismiss'): void {
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
    this.closed.next(reason);
  }

  toggle(): void {
    this.overlayRef ? this.close() : this.open();
  }
}
