import { BorderRadiusCorners, buildBorderRadiusDeclaration, buildBorderRadiusValue } from "./border-radius-logic.js";

describe('buildBorderRadiusValue', () => {
  it('collapses to a single value when all corners match', () => {
    const corners: BorderRadiusCorners = { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 };
    expect(buildBorderRadiusValue(corners, 'px')).toBe('8px');
  });

  it('lists all 4 corners in top-left/top-right/bottom-right/bottom-left order when they differ', () => {
    const corners: BorderRadiusCorners = { topLeft: 4, topRight: 8, bottomRight: 12, bottomLeft: 16 };
    expect(buildBorderRadiusValue(corners, 'px')).toBe('4px 8px 12px 16px');
  });

  it('supports percentage units', () => {
    const corners: BorderRadiusCorners = { topLeft: 50, topRight: 50, bottomRight: 50, bottomLeft: 50 };
    expect(buildBorderRadiusValue(corners, '%')).toBe('50%');
  });
});

describe('buildBorderRadiusDeclaration', () => {
  it('wraps the value in a border-radius declaration', () => {
    const corners: BorderRadiusCorners = { topLeft: 8, topRight: 8, bottomRight: 8, bottomLeft: 8 };
    expect(buildBorderRadiusDeclaration(corners, 'px')).toBe('border-radius: 8px;');
  });
});
