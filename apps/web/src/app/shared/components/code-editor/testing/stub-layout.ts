/**
 * jsdom has no text layout. CodeMirror only needs `Range` measurements to answer "nothing measurable" for
 * its views to mount and edit in a spec; call this in `beforeAll` of any spec that loads the real engine.
 */
export function stubEditorLayout(): void {
  const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0, toJSON: () => ({}) };
  const rects = Object.assign([], { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => rects as unknown as DOMRectList;
}
