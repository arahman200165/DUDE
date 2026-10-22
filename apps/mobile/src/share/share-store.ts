import type { IncomingShare } from './share-model';

/** The share currently on screen. In memory only: never persisted, synchronized or written to the outbox; wiped like tool inputs. */
export type PendingShare = { readonly share: IncomingShare } | { readonly error: string };

export class ShareStore {
  private current: PendingShare | null = null;
  private readonly listeners = new Set<() => void>();
  get = (): PendingShare | null => this.current;
  set(next: PendingShare): void { this.current = next; this.emit(); }
  clear(): void { if (this.current) { this.current = null; this.emit(); } }
  /** Matches the background-wipe store contract. */
  clearAll(): void { this.clear(); }
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private emit(): void { for (const listener of [...this.listeners]) listener(); }
}

export const shareStore = new ShareStore();
