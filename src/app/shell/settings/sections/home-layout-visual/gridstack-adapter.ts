import { InjectionToken } from '@angular/core';
import type { Placement } from '../../../../core/home-layout/grid-engine';
import { placementForKey } from '../../../../core/home-layout/visual-keys';

/** One panel as the visual editor draws it. */
export interface VisualItem {
  readonly id: string;
  readonly title: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly minW: number;
  readonly minH: number;
  readonly maxW?: number;
  readonly maxH?: number;
  /** Panels whose kind no longer exists are shown but can't be moved. */
  readonly locked?: boolean;
}

export interface GridAdapterHandlers {
  /**
   * The pointer/keyboard proposes a new placement. The caller validates it through the grid engine
   * and returns whether it was accepted; on refusal the adapter snaps everything back to `items`.
   */
  propose(id: string, placement: Placement): boolean;
}

/** The narrow seam between the editor and the drag/resize library, so the library is swappable. */
export interface GridAdapter {
  /** Make the drawing match `items` exactly (the draft is always the source of truth). */
  setItems(items: readonly VisualItem[]): void;
  destroy(): void;
}

export type GridAdapterFactory = (host: HTMLElement, items: readonly VisualItem[], handlers: GridAdapterHandlers) => Promise<GridAdapter>;

const CELL_HEIGHT_PX = 28;

/**
 * gridstack-backed adapter. The library is imported lazily (so it is never part of the Home
 * bundle), runs in `float` mode with a fixed 12 columns and no responsive one-column mode, and
 * only ever *proposes*: nothing it computes is stored until the caller accepts it. Panel labels go
 * through gridstack's default `textContent` renderer, so a title can't inject markup.
 */
export const createGridstackAdapter: GridAdapterFactory = async (host, initial, handlers) => {
  const { GridStack } = await import('gridstack');
  let current = [...initial];

  const grid = GridStack.init(
    {
      column: 12,
      cellHeight: CELL_HEIGHT_PX,
      margin: 2,
      mode: 'float',
      animate: false,
      alwaysShowResizeHandle: true,
    },
    host,
  );
  if (!grid) throw new Error('gridstack failed to initialise');

  const toWidget = (i: VisualItem) => ({
    id: i.id,
    x: i.x,
    y: i.y,
    w: i.w,
    h: i.h,
    minW: i.minW,
    minH: i.minH,
    maxW: i.maxW,
    maxH: i.maxH,
    noMove: i.locked,
    noResize: i.locked,
    content: i.title,
  });

  /** Expose each panel to assistive tech and keyboard users, and label the handles (no hover needed). */
  const decorate = (): void => {
    for (const el of grid.getGridItems()) {
      const id = el.gridstackNode?.id;
      const item = current.find((i) => i.id === id);
      if (!item) continue;
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'group');
      el.setAttribute(
        'aria-label',
        `${item.title}: column ${item.x + 1}, row ${item.y + 1}, ${item.w} by ${item.h} cells. Arrow keys move it, Shift plus arrow keys resize it.`,
      );
      el.setAttribute('title', 'Drag to move. Arrow keys move, Shift+arrow keys resize.');
      el.querySelector('.ui-resizable-se')?.setAttribute('title', 'Drag to resize');
    }
  };

  const sync = (items: readonly VisualItem[]): void => {
    current = [...items];
    grid.batchUpdate();
    grid.load(items.map(toWidget));
    grid.batchUpdate(false);
    decorate();
  };

  const onPointerEnd = (_event: Event, el: { gridstackNode?: { id?: string; x?: number; y?: number; w?: number; h?: number } }): void => {
    const node = el.gridstackNode;
    if (!node?.id) return;
    const placement = { x: node.x ?? 0, y: node.y ?? 0, w: node.w ?? 1, h: node.h ?? 1 };
    // Refused: snap back to the draft. Accepted: the editor pushes the new items via `setItems`.
    if (!handlers.propose(node.id, placement)) sync(current);
  };
  grid.on('dragstop', onPointerEnd);
  grid.on('resizestop', onPointerEnd);

  const onKeydown = (event: KeyboardEvent): void => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('.grid-stack-item');
    const item = current.find((i) => i.id === (target as unknown as { gridstackNode?: { id?: string } } | null)?.gridstackNode?.id);
    if (!item || item.locked) return;
    const proposal = placementForKey(event.key, event.shiftKey, item);
    if (!proposal) return;
    event.preventDefault();
    if (!handlers.propose(item.id, proposal)) sync(current);
  };
  host.addEventListener('keydown', onKeydown);

  sync(current);

  return {
    setItems: (items) => sync(items),
    destroy: () => {
      host.removeEventListener('keydown', onKeydown);
      grid.destroy(false);
      host.replaceChildren();
    },
  };
};

export const GRID_ADAPTER_FACTORY = new InjectionToken<GridAdapterFactory>('GRID_ADAPTER_FACTORY', {
  providedIn: 'root',
  factory: () => createGridstackAdapter,
});
