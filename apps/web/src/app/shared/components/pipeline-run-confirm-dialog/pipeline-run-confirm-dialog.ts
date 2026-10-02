import { Component, input, output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { ConsequenceClass, ToolDefinition } from '../../models/tool-definition.model';
import { SecurityBadge } from '../security-badge/security-badge';

export interface PipelineConfirmationStep {
  readonly label: string;
  readonly definition?: ToolDefinition;
  readonly consequenceClasses: readonly ConsequenceClass[];
}

export interface PipelineConfirmationSummary {
  readonly name: string;
  readonly steps: readonly PipelineConfirmationStep[];
  readonly consequenceClasses: readonly ConsequenceClass[];
}

/** Review surface shared by deep links and future in-app run commands. */
@Component({
  selector: 'app-pipeline-run-confirm-dialog',
  imports: [CdkTrapFocus, SecurityBadge],
  templateUrl: './pipeline-run-confirm-dialog.html',
})
export class PipelineRunConfirmDialog {
  readonly summary = input.required<PipelineConfirmationSummary>();
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();
}
