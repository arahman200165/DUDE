/**
 * One-shot, in-memory-only hand-off used by `<id>.workspace-step.ts` adapters belonging to
 * `'none'`-policy tools — nothing to write via `workspace-storage-bridge.ts`, since those tools
 * never touch storage by design (e.g. JWT Debugger). Structurally identical to
 * `core/paste-detect/paste-handoff.service.ts`: a value offered here and never consumed (the tool
 * is never reopened, or the page is hard-refreshed first) simply vanishes — nothing routed through
 * this module is ever persisted, consistent with DUDE_PRD.md §14.1/§30.
 *
 * Deliberately a **plain module**, not an `@Injectable` service: a `<id>.workspace-step.ts`
 * adapter's `restore()` runs as an ordinary function call, not inside an Angular injection context,
 * so it can't use `inject()`. A tool's own component constructor also just imports and calls
 * `consumeWorkspaceState` directly — the same shape `PasteHandoffService.consume(...)` already
 * uses at the call site, without requiring DI on either side of the hand-off.
 */
const pending = new Map<string, Readonly<Record<string, unknown>>>();

export function offerWorkspaceState(toolId: string, state: Readonly<Record<string, unknown>>): void {
  pending.set(toolId, state);
}

export function consumeWorkspaceState(toolId: string): Readonly<Record<string, unknown>> | undefined {
  const state = pending.get(toolId);
  pending.delete(toolId);
  return state;
}
