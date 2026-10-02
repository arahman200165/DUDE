export interface GridContainerSettings {
  readonly columns: string;
  readonly rows: string;
  readonly columnGap: number;
  readonly rowGap: number;
  readonly justifyItems: string;
  readonly alignItems: string;
}

export interface GridItemSettings {
  /** Free-form grid-column value, e.g. `auto`, `1`, `1 / 3`, `span 2` -- covers placement without a dedicated start/end/span control per axis. */
  readonly gridColumn: string;
  readonly gridRow: string;
}

export const DEFAULT_GRID_CONTAINER: GridContainerSettings = {
  columns: 'repeat(3, 1fr)',
  rows: 'repeat(2, 80px)',
  columnGap: 8,
  rowGap: 8,
  justifyItems: 'stretch',
  alignItems: 'stretch',
};

export const DEFAULT_GRID_ITEMS: readonly GridItemSettings[] = [
  { gridColumn: 'auto', gridRow: 'auto' },
  { gridColumn: 'auto', gridRow: 'auto' },
  { gridColumn: 'auto', gridRow: 'auto' },
];

export function buildGridContainerCss(s: GridContainerSettings): string {
  return [
    'display: grid;',
    `grid-template-columns: ${s.columns};`,
    `grid-template-rows: ${s.rows};`,
    `column-gap: ${s.columnGap}px;`,
    `row-gap: ${s.rowGap}px;`,
    `justify-items: ${s.justifyItems};`,
    `align-items: ${s.alignItems};`,
  ].join(' ');
}

export function buildGridItemCss(item: GridItemSettings): string {
  const parts: string[] = [];
  if (item.gridColumn !== 'auto') parts.push(`grid-column: ${item.gridColumn};`);
  if (item.gridRow !== 'auto') parts.push(`grid-row: ${item.gridRow};`);
  return parts.join(' ');
}

export function buildGridCss(container: GridContainerSettings, items: readonly GridItemSettings[]): string {
  const rules = items
    .map((item, i) => {
      const itemCss = buildGridItemCss(item);
      return itemCss ? `.item-${i} { ${itemCss} }` : '';
    })
    .filter((rule) => rule !== '')
    .join('\n');
  return rules === '' ? `.grid { ${buildGridContainerCss(container)} }` : `.grid { ${buildGridContainerCss(container)} }\n${rules}`;
}

export function buildGridHtml(items: readonly GridItemSettings[]): string {
  const children = items.map((_, i) => `  <div class="item item-${i}">${i + 1}</div>`).join('\n');
  return `<div class="grid">\n${children}\n</div>`;
}
