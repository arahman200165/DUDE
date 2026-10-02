import { hostCrypto } from "@dude/crypto/host";
import { DudeDataType } from "@dude/shared-types/shared/models/tool-io.model";

export type PipelineRunStatus = 'idle' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';

export interface ToolPipelineStep {
  readonly kind: 'tool';
  readonly stepId: string;
  readonly toolId: string;
  readonly label?: string;
}

export interface ScriptPipelineStep {
  readonly kind: 'script';
  readonly stepId: string;
  readonly label?: string;
  readonly scriptId: string;
}

export type PipelineStepRef = ToolPipelineStep | ScriptPipelineStep;

export interface Pipeline {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly steps: readonly PipelineStepRef[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastRunAt?: string;
  readonly lastRunStatus?: PipelineRunStatus;
}

export interface PipelineStore {
  readonly schemaVersion: 1;
  readonly pipelines: readonly Pipeline[];
}

export const EMPTY_PIPELINE_STORE: PipelineStore = { schemaVersion: 1, pipelines: [] };

export function createPipeline(name: string): Pipeline {
  const now = new Date().toISOString();
  return { schemaVersion: 1, id: hostCrypto().randomUUID(), name, steps: [], createdAt: now, updatedAt: now };
}

export function createToolStep(toolId: string, label?: string): ToolPipelineStep {
  return { kind: 'tool', stepId: hostCrypto().randomUUID(), toolId, label };
}

export function createScriptStep(scriptId: string, label?: string): ScriptPipelineStep {
  return { kind: 'script', stepId: hostCrypto().randomUUID(), scriptId, label };
}

/** Defensive parse: unknown/corrupt persisted data resets to an empty store rather than throwing. */
export function migratePipelineStore(raw: unknown): PipelineStore {
  if (!raw || typeof raw !== 'object') return EMPTY_PIPELINE_STORE;
  const candidate = raw as Partial<PipelineStore>;
  if (candidate.schemaVersion === 1 && Array.isArray(candidate.pipelines)) {
    return { schemaVersion: 1, pipelines: candidate.pipelines };
  }
  return EMPTY_PIPELINE_STORE;
}

export interface UserScriptDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly body: string;
  readonly accepts: readonly DudeDataType[];
  readonly produces: readonly DudeDataType[];
  readonly timeoutMs: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Arrived via a bundle import (Phase 26 Item 14). It executes code, so it can't run in any
   * pipeline until the user explicitly reviews it (`UserScriptStoreService.markReviewed`).
   */
  readonly imported?: boolean;
}

export interface UserScriptStore {
  readonly schemaVersion: 1;
  readonly scripts: readonly UserScriptDefinition[];
}

export const EMPTY_USER_SCRIPT_STORE: UserScriptStore = { schemaVersion: 1, scripts: [] };

export function createUserScript(name: string): UserScriptDefinition {
  const now = new Date().toISOString();
  return { id: hostCrypto().randomUUID(), name, body: '', accepts: ['text'], produces: ['text'], timeoutMs: 3000, createdAt: now, updatedAt: now };
}

export function migrateUserScriptStore(raw: unknown): UserScriptStore {
  if (!raw || typeof raw !== 'object') return EMPTY_USER_SCRIPT_STORE;
  const candidate = raw as Partial<UserScriptStore>;
  if (candidate.schemaVersion === 1 && Array.isArray(candidate.scripts)) {
    return { schemaVersion: 1, scripts: candidate.scripts };
  }
  return EMPTY_USER_SCRIPT_STORE;
}
