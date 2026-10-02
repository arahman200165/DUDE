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
    overlayRef.attach(new ComponentPortal(CommandPalette));

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
