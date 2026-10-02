
// SVG viewBox is 200x200, mapped to x:[0,1] and y:[-0.5,1.5] (extra margin above/below so overshoot presets stay visible).
export const SVG_SIZE = 200;
export const Y_MIN = -0.5;
export const Y_RANGE = 2;
export function CubicBezierEditor_toSvgX(x: number): number {
    return x * SVG_SIZE;
}
export function CubicBezierEditor_toSvgY(y: number): number {
    return SVG_SIZE - ((y - Y_MIN) / Y_RANGE) * SVG_SIZE;
}
