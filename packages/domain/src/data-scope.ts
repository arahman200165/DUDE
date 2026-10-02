/** Project membership uses workspace scope. This vocabulary grants no sync consent. */
export const DATA_SCOPES = ['environment', 'workspace', 'device', 'local-only'] as const;
export type DataScope = typeof DATA_SCOPES[number];
export type DataSensitivity = 'non-sensitive' | 'sensitive' | 'secret';

/** Declaration only: retention and enrollment/consent remain independent dimensions. */
export interface DataClassification {
  readonly scope: DataScope;
  readonly sensitivity: DataSensitivity;
}

export function isDataScope(value: unknown): value is DataScope {
  return typeof value === 'string' && DATA_SCOPES.some(scope => scope === value);
}
