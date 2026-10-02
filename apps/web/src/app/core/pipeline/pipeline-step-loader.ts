import { isDevMode } from '@angular/core';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PipelineStep } from "@dude/contracts/shared/models/pipeline-step.model";
import { PIPELINE_STEP_LOADERS } from '../registry/tool-loaders.generated';

/**
 * Resolves tool `id`'s pipeline step purely by naming convention — never via a hand-maintained
 * field on `ToolDefinition` or a parallel `id -> step` map (see `AGENTS.md` in this directory).
 * Returns `undefined` for a tool with no `<id>.pipeline-step.ts` file, which is a normal,
 * expected outcome (multi-input tools, network-required tools, and anything not yet migrated
 * are all "not pipeline-eligible," not an error).
 */
export async function loadPipelineStep(id: string): Promise<PipelineStep | undefined> {
  try {
    return await PIPELINE_STEP_LOADERS[id]?.();
  } catch {
    return undefined;
  }
}

/**
 * Dev-mode consistency check between a resolved step's actual capabilities and the tool's
 * declared `io` metadata — the first point at which `io.accepts`/`io.produces` becomes
 * runtime-enforced rather than purely declarative.
 */
export function validatePipelineStepIo(definition: ToolDefinition, step: PipelineStep): void {
  if (!isDevMode()) return;

  const missingAccepts = step.accepts.filter((type) => !definition.io.accepts.includes(type));
  const missingProduces = step.produces.filter((type) => !definition.io.produces.includes(type));

  if (missingAccepts.length > 0) {
    console.error(
      `Pipeline step for "${definition.id}" accepts [${missingAccepts.join(', ')}], which is not declared in its ToolDefinition.io.accepts.`,
    );
  }
  if (missingProduces.length > 0) {
    console.error(
      `Pipeline step for "${definition.id}" produces [${missingProduces.join(', ')}], which is not declared in its ToolDefinition.io.produces.`,
    );
  }
}
