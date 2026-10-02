export interface AdvancedDiffImagePayload {
  readonly left: ArrayBuffer;
  readonly right: ArrayBuffer;
  readonly threshold: number;
}
