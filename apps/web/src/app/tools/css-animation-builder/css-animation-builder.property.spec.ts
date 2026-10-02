import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { AnimationSettings, KeyframeStop, buildKeyframesBlock, buildAnimationDeclaration, buildFullCss } from "@dude/tool-engine/tools/css-animation-builder/css-animation-logic";

const stopArb: fc.Arbitrary<KeyframeStop> = fc.record({ percent: fc.integer({ min: 0, max: 100 }), declarations: fc.string({ maxLength: 80 }) });
const settingsArb: fc.Arbitrary<AnimationSettings> = fc.record({ name: fc.stringMatching(/^[A-Za-z][A-Za-z0-9_-]{0,12}$/), durationSeconds: fc.double({ min: 0, max: 60, noNaN: true }), timingFunction: fc.constantFrom('linear', 'ease', 'ease-in-out'), delaySeconds: fc.double({ min: 0, max: 60, noNaN: true }), iterationCount: fc.constantFrom('1', '2', 'infinite'), direction: fc.constantFrom('normal', 'reverse', 'alternate') });
describe('css-animation-builder properties', () => {
  it('emits stable keyframes and declarations for generated inputs', () => invariant(([settings, stops]: [AnimationSettings, readonly KeyframeStop[]]) => buildFullCss(settings, stops), fc.tuple(settingsArb, fc.array(stopArb, { maxLength: 12 })), (css, [settings, stops]) => css === `${buildKeyframesBlock(settings.name, stops)}\n\n.animated {\n  ${buildAnimationDeclaration(settings)}\n}` && css.includes('@keyframes ')));
  it('handles arbitrary bounded stops', () => neverThrows((stops: readonly KeyframeStop[]) => buildKeyframesBlock('animation', stops), fc.array(stopArb, { maxLength: 20 })));
});
