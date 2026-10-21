/** Per-tool input state. In memory only: never persisted, never synced, never written to the outbox. */
export type ToolInput = Readonly<Record<string, unknown>>;

const EMPTY: ToolInput = Object.freeze({});

export class ToolInputStore {
  private readonly inputs = new Map<string, ToolInput>();
  private readonly listeners = new Set<() => void>();

  /** Stable reference until the tool input changes, so it is safe as a useSyncExternalStore snapshot. */
  get(toolId: string): ToolInput { return this.inputs.get(toolId) ?? EMPTY; }
  /** Shallow-merges a partial update into the tool's current input. */
  set(toolId: string, partial: ToolInput): void {
    this.inputs.set(toolId, Object.freeze({ ...this.get(toolId), ...partial }));
    this.emit();
  }
  /** Replaces the tool's input, e.g. when Share-to-DUDE hands content to a chosen tool. */
  prefill(toolId: string, input: ToolInput): void {
    this.inputs.set(toolId, Object.freeze({ ...input }));
    this.emit();
  }
  clear(toolId: string): void { if (this.inputs.delete(toolId)) this.emit(); }
  clearAll(): void { if (this.inputs.size) { this.inputs.clear(); this.emit(); } }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(): void { for (const listener of [...this.listeners]) listener(); }
}

export const toolInputStore = new ToolInputStore();
