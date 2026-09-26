import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { GridContainerSettings, GridItemSettings, buildGridCss, buildGridHtml } from './css-grid-logic';

const containerArb: fc.Arbitrary<GridContainerSettings> = fc.record({ columns: fc.constantFrom('1fr', 'repeat(2, 1fr)', '100px 1fr'), rows: fc.constantFrom('auto', '80px 120px'), columnGap: fc.integer({ min: 0, max: 100 }), rowGap: fc.integer({ min: 0, max: 100 }), justifyItems: fc.constantFrom('stretch', 'center'), alignItems: fc.constantFrom('stretch', 'end') });
const itemsArb = fc.array(fc.record({ gridColumn: fc.constantFrom('auto', '1', 'span 2'), gridRow: fc.constantFrom('auto', '1', '2 / 3') }), { maxLength: 12 });
describe('css-grid-playground properties', () => {
  it('emits matching HTML and CSS rules for each configured placement', () => invariant(([container, items]: [GridContainerSettings, readonly GridItemSettings[]]) => [buildGridCss(container, items), buildGridHtml(items)], fc.tuple(containerArb, itemsArb), ([css, html], [, items]) => (html.match(/class="item item-/g) ?? []).length === items.length && css.includes('.grid { display: grid;') && items.every((item, i) => (item.gridColumn === 'auto' && item.gridRow === 'auto') ? !css.includes(`.item-${i} {`) : css.includes(`.item-${i} {`))));
  it('handles arbitrary bounded item lists', () => neverThrows((items: readonly GridItemSettings[]) => buildGridHtml(items), itemsArb));
});
