import { Injectable, inject } from '@angular/core';
import { ConnectivityService } from '../connectivity/connectivity.service';
import { OfflineReadinessService } from '../offline/offline-readiness.service';
import { RUNTIMES } from "@dude/contracts/core/platform/capability-catalog";
import { ToolRegistryService } from '../registry/tool-registry.service';
import { PipelineStep } from "@dude/contracts/shared/models/pipeline-step.model";
import { PipelineStepRef } from "@dude/domain/core/pipeline/pipeline.model";
import { UserScriptStoreService } from './user-script-store.service';

/**
 * Browser-Safe Pipeline Execution gate (DUDE_PRD.md §21 Phase 26 Item 13), shared by the builder's
 * live warnings and the runner's pre-flight check.
 *
 * Pipeline steps run shared-core logic only (enforced by the web/desktop parity suite), so a tool's
 * desktop-only *platform* capability (e.g. Regex Tester's LLM proxy) never blocks its step. What
 * genuinely stops a step in the browser is being offline with its code or declared runtime not cached
 * yet. That is reported up front, not as a mid-chain failure. Inert on desktop, in dev, and online.
 *
 * On every platform, a user script that arrived in an imported bundle (Item 14) is blocked until
 * the user reviews it, because running someone else's code must never be a side effect of an import.
 */
@Injectable({ providedIn: 'root' })
export class PipelineStepGateService {
  private readonly readiness = inject(OfflineReadinessService);
  private readonly connectivity = inject(ConnectivityService);
  private readonly registry = inject(ToolRegistryService);
  private readonly scripts = inject(UserScriptStoreService);

  readonly gate = (ref: PipelineStepRef, step: PipelineStep | undefined): string | undefined => {
    if (ref.kind === 'script') {
      return this.scripts.getById(ref.scriptId)?.imported
        ? 'Imported script: review its code under Pipelines › Scripts and mark it reviewed before it can run.'
        : undefined;
    }
    if (!this.readiness.enabled || this.connectivity.online()) return undefined;
    for (const runtime of this.registry.runtimesOf(ref.toolId)) {
      if (this.readiness.planRuntime(runtime)?.missingFiles.length) {
        return `Offline: this step needs the ${RUNTIMES[runtime].label} runtime, which isn't cached yet. Go online once, cache it under Settings › Web & Offline, or open this pipeline in Desktop DUDE.`;
      }
    }
    if (!step) {
      return "Offline: this step's code isn't cached yet. Go online once, or cache it under Settings › Web & Offline.";
    }
    return undefined;
  };
}
