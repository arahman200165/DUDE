import { DEFAULT_TRANSFORM_STATE, buildTransformDeclaration, buildTransformValue } from "./css-transform-logic.js";

describe('buildTransformValue', () => {
  it('returns "none" for the identity transform', () => {
    expect(buildTransformValue(DEFAULT_TRANSFORM_STATE)).toBe('none');
  });

  it('includes only non-identity functions, in translate/rotate/scale/skew order', () => {
    const value = buildTransformValue({ ...DEFAULT_TRANSFORM_STATE, translateX: 10, rotate: 45, scaleX: 2, scaleY: 2, skewX: 5 });
    expect(value).toBe('translate(10px, 0px) rotate(45deg) scale(2, 2) skew(5deg, 0deg)');
  });

  it('omits scale entirely when both axes are 1', () => {
    const value = buildTransformValue({ ...DEFAULT_TRANSFORM_STATE, rotate: 10 });
    expect(value).toBe('rotate(10deg)');
  });
});

describe('buildTransformDeclaration', () => {
  it('emits both transform and transform-origin declarations', () => {
    const decl = buildTransformDeclaration({ ...DEFAULT_TRANSFORM_STATE, rotate: 10, origin: 'top left' });
    expect(decl).toBe('transform: rotate(10deg);\ntransform-origin: top left;');
  });
});
