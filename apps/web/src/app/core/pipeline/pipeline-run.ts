import { Signal } from '@angular/core';
import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";
import { PipelineRunStatus } from "@dude/domain/core/pipeline/pipeline.model";

export type PipelineStepRunStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

export interface PipelineStepRun {
  readonly stepId: string;
  readonly status: PipelineStepRunStatus;
  readonly output: unknown | null;
  readonly outputType: DudeDataType | null;
  readonly error: string | null;
  readonly durationMs: number | null;
}

/** Signals-based run handle, deliberately mirroring `WorkerJob`'s shape (PRD §21 Item 2). */
export interface PipelineRun {
  readonly status: Signal<PipelineRunStatus>;
  readonly currentStepIndex: Signal<number | null>;
  readonly stepResults: Signal<readonly PipelineStepRun[]>;
  readonly finalOutput: Signal<unknown | null>;
  cancel(): void;
}
