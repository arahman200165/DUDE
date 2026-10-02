import { Injectable, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { PipelineConfirmationSummary, PipelineRunConfirmDialog } from '../../shared/components/pipeline-run-confirm-dialog/pipeline-run-confirm-dialog';
import { ConsequenceClass } from '../../shared/models/tool-definition.model';
import { ToolRegistryService } from '../registry/tool-registry.service';
import { Pipeline } from "@dude/domain/core/pipeline/pipeline.model";
import { UserScriptStoreService } from './user-script-store.service';

@Injectable({ providedIn: 'root' })
export class PipelineConfirmationService {
  private readonly overlay = inject(Overlay);
  private readonly registry = inject(ToolRegistryService);
  private readonly scripts = inject(UserScriptStoreService);
  private active: OverlayRef | null = null;

  /** Builds the visible review from live registry metadata, never saved pipeline copies. */
  summarize(pipeline: Pipeline): PipelineConfirmationSummary {
    const steps = pipeline.steps.map((ref) => {
      if (ref.kind === 'script') {
        return {
          label: ref.label ?? this.scripts.getById(ref.scriptId)?.name ?? 'Missing script',
          consequenceClasses: ['code-execution'] as readonly ConsequenceClass[],
        };
      }
      const definition = this.registry.getById(ref.toolId);
      return {
        label: ref.label ?? definition?.title ?? ref.toolId,
        definition,
        consequenceClasses: definition?.consequenceClass ?? [],
      };
    });
    return {
      name: pipeline.name,
      steps,
      consequenceClasses: [...new Set(steps.flatMap((step) => step.consequenceClasses))],
    };
  }

  /** A callback can run only from the dialog's explicit Run button. */
  confirm(summary: PipelineConfirmationSummary, onConfirm: () => void): void {
    if (this.active) return;
    const overlayRef = this.overlay.create({
      hasBackdrop: true,
      backdropClass: 'bg-bg/70',
      positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      scrollStrategy: this.overlay.scrollStrategies.block(),
    });
    this.active = overlayRef;
    const dialog = overlayRef.attach(new ComponentPortal(PipelineRunConfirmDialog));
    dialog.setInput('summary', summary);
    const close = () => {
      overlayRef.dispose();
      if (this.active === overlayRef) this.active = null;
    };
    dialog.instance.cancelled.subscribe(close);
    dialog.instance.confirmed.subscribe(() => { close(); onConfirm(); });
    overlayRef.backdropClick().subscribe(close);
    overlayRef.keydownEvents().subscribe((event) => { if (event.key === 'Escape') close(); });
  }
}
