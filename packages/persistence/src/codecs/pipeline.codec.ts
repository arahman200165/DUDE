import type { Pipeline, PipelineRunStatus, PipelineStepRef, UserScriptDefinition } from '@dude/domain/core/pipeline/pipeline.model';
import { DUDE_DATA_TYPES } from '@dude/shared-types/shared/models/tool-io.model';
import type { DudeDataType } from '@dude/shared-types/shared/models/tool-io.model';
import type { EntityCodec } from './entity-codec.js';
import { isNonEmptyString, isRecord, optionalString } from './codec-helpers.js';

const RUN_STATUSES: readonly PipelineRunStatus[] = ['idle', 'running', 'succeeded', 'failed', 'blocked', 'cancelled'];

function sanitizeStep(raw: unknown): PipelineStepRef | null {
  if (!isRecord(raw) || !isNonEmptyString(raw['stepId'])) return null;
  const label = optionalString('label', raw['label']);
  if (raw['kind'] === 'tool' && isNonEmptyString(raw['toolId'])) {
    return { kind: 'tool', stepId: raw['stepId'], toolId: raw['toolId'], ...label };
  }
  if (raw['kind'] === 'script' && isNonEmptyString(raw['scriptId'])) {
    return { kind: 'script', stepId: raw['stepId'], scriptId: raw['scriptId'], ...label };
  }
  return null;
}

export const pipelineCodec: EntityCodec<Pipeline> = {
  entityType: 'pipeline',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'sensitive',
  journaled: true,
  idOf: (pipeline) => pipeline.id,
  decode(raw) {
    if (!isRecord(raw)) return null;
    if (raw['schemaVersion'] !== undefined && raw['schemaVersion'] !== 1) return null;
    const { id, name, createdAt, updatedAt } = raw;
    if (!isNonEmptyString(id) || typeof name !== 'string' || typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
    const steps = (Array.isArray(raw['steps']) ? raw['steps'] : []).map(sanitizeStep).filter((s): s is PipelineStepRef => s !== null);
    const status = raw['lastRunStatus'];
    return {
      schemaVersion: 1,
      id,
      name,
      ...optionalString('description', raw['description']),
      steps,
      createdAt,
      updatedAt,
      ...optionalString('lastRunAt', raw['lastRunAt']),
      ...(RUN_STATUSES.includes(status as PipelineRunStatus) ? { lastRunStatus: status as PipelineRunStatus } : {}),
    };
  },
  encode: (pipeline) => ({ ...pipeline }),
};

const DEFAULT_TIMEOUT_MS = 3000;

const dataTypes = (raw: unknown): DudeDataType[] =>
  (Array.isArray(raw) ? raw : []).filter((t): t is DudeDataType => DUDE_DATA_TYPES.includes(t as DudeDataType));

export const userScriptCodec: EntityCodec<UserScriptDefinition> = {
  entityType: 'user-script',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'sensitive',
  journaled: true,
  idOf: (script) => script.id,
  decode(raw) {
    if (!isRecord(raw)) return null;
    const { id, name, body, createdAt, updatedAt } = raw;
    if (!isNonEmptyString(id) || typeof name !== 'string' || typeof body !== 'string') return null;
    if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return null;
    const timeout = raw['timeoutMs'];
    return {
      id,
      name,
      ...optionalString('description', raw['description']),
      body,
      accepts: dataTypes(raw['accepts']),
      produces: dataTypes(raw['produces']),
      timeoutMs: typeof timeout === 'number' && Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
      createdAt,
      updatedAt,
      ...(raw['imported'] === true ? { imported: true } : {}),
    };
  },
  encode: (script) => ({ ...script }),
};
