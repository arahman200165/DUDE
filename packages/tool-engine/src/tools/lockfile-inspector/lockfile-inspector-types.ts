export interface NormalizedPackage {
  readonly name: string;
  readonly version: string;
  readonly resolved: string | null;
  readonly dependencies: readonly string[];
}

export type LockfileFormat = 'npm' | 'pnpm' | 'yarn-classic' | 'yarn-berry';
