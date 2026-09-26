import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { FlexContainerSettings, FlexItemSettings, buildFlexboxCss, buildFlexboxHtml } from './flexbox-logic';

const containerArb: fc.Arbitrary<FlexContainerSettings> = fc.record({ direction: fc.constantFrom('row', 'row-reverse', 'column', 'column-reverse'), wrap: fc.constantFrom('nowrap', 'wrap', 'wrap-reverse'), justifyContent: fc.constantFrom('center', 'space-between'), alignItems: fc.constantFrom('stretch', 'center'), alignContent: fc.constantFrom('normal', 'center'), gap: fc.integer({ min: 0, max: 100 }) });
const itemsArb: fc.Arbitrary<readonly FlexItemSettings[]> = fc.array(fc.record({ grow: fc.integer({ min: 0, max: 10 }), shrink: fc.integer({ min: 0, max: 10 }), basis: fc.constantFrom('auto', '0', '50%'), alignSelf: fc.constantFrom('auto', 'center') }), { maxLength: 12 });
describe('flexbox-playground properties', () => {
  it('generates one HTML item and CSS item rule per item', () => invariant(([container, items]: [FlexContainerSettings, readonly FlexItemSettings[]]) => [buildFlexboxCss(container, items), buildFlexboxHtml(items)], fc.tuple(containerArb, itemsArb), ([css, html], [, items]) => (html.match(/class="item item-/g) ?? []).length === items.length && (items.length === 0 || css.includes(`.item-${items.length - 1} {`)) && css.includes('display: flex;')));
  it('handles arbitrary bounded item lists', () => neverThrows((items: readonly FlexItemSettings[]) => buildFlexboxHtml(items), itemsArb));
});
