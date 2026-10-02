export interface FlexContainerSettings {
  readonly direction: 'row' | 'row-reverse' | 'column' | 'column-reverse';
  readonly wrap: 'nowrap' | 'wrap' | 'wrap-reverse';
  readonly justifyContent: string;
  readonly alignItems: string;
  readonly alignContent: string;
  readonly gap: number;
}

export interface FlexItemSettings {
  readonly grow: number;
  readonly shrink: number;
  readonly basis: string;
  readonly alignSelf: string;
}

export const DEFAULT_CONTAINER: FlexContainerSettings = {
  direction: 'row',
  wrap: 'nowrap',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  alignContent: 'normal',
  gap: 8,
};

export const DEFAULT_ITEMS: readonly FlexItemSettings[] = [
  { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'auto' },
  { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'auto' },
  { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'auto' },
];

export function buildContainerCss(s: FlexContainerSettings): string {
  return [
    'display: flex;',
    `flex-direction: ${s.direction};`,
    `flex-wrap: ${s.wrap};`,
    `justify-content: ${s.justifyContent};`,
    `align-items: ${s.alignItems};`,
    `align-content: ${s.alignContent};`,
    `gap: ${s.gap}px;`,
  ].join(' ');
}

export function buildItemCss(item: FlexItemSettings): string {
  const parts = [`flex-grow: ${item.grow};`, `flex-shrink: ${item.shrink};`, `flex-basis: ${item.basis};`];
  if (item.alignSelf !== 'auto') parts.push(`align-self: ${item.alignSelf};`);
  return parts.join(' ');
}

export function buildFlexboxCss(container: FlexContainerSettings, items: readonly FlexItemSettings[]): string {
  const rules = items.map((item, i) => `.item-${i} { ${buildItemCss(item)} }`).join('\n');
  return `.container { ${buildContainerCss(container)} }\n${rules}`;
}

export function buildFlexboxHtml(items: readonly FlexItemSettings[]): string {
  const children = items.map((_, i) => `  <div class="item item-${i}">${i + 1}</div>`).join('\n');
  return `<div class="container">\n${children}\n</div>`;
}
