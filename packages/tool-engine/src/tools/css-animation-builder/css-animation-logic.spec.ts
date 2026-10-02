import {
  AnimationSettings,
  DEFAULT_ANIMATION_SETTINGS,
  KeyframeStop,
  buildAnimationDeclaration,
  buildKeyframesBlock,
} from "./css-animation-logic.js";

const STOPS: readonly KeyframeStop[] = [
  { percent: 0, declarations: 'opacity: 0;' },
  { percent: 100, declarations: 'opacity: 1;' },
];

describe('buildKeyframesBlock', () => {
  it('emits a @keyframes block with one rule per stop', () => {
    expect(buildKeyframesBlock('fade', STOPS)).toBe('@keyframes fade {\n  0% { opacity: 0; }\n  100% { opacity: 1; }\n}');
  });

  it('sorts stops by percent regardless of input order', () => {
    const out = buildKeyframesBlock('fade', [STOPS[1], STOPS[0]]);
    expect(out).toBe('@keyframes fade {\n  0% { opacity: 0; }\n  100% { opacity: 1; }\n}');
  });
});

describe('buildAnimationDeclaration', () => {
  it('formats the shorthand in name/duration/timing/delay/iteration/direction order', () => {
    const settings: AnimationSettings = { ...DEFAULT_ANIMATION_SETTINGS, name: 'pulse', durationSeconds: 2, delaySeconds: 0.5 };
    expect(buildAnimationDeclaration(settings)).toBe('animation: pulse 2s ease-in-out 0.5s infinite normal;');
  });
});
