/**
 * Ambient types for `railroad-diagrams` (no shipped .d.ts) — a small, zero-dependency,
 * CC0-licensed UMD library (github.com/tabatkins/railroad-diagrams) that builds a
 * railroad-syntax-diagram as real SVG DOM nodes. Constructors are callable without
 * `new` (each checks `this instanceof X` internally) and text content goes through
 * `.textContent`/an explicit HTML-entity escape before ever reaching `innerHTML`, so
 * user-controlled pattern text passed to `Terminal`/`NonTerminal`/`Comment` is safe.
 * Only the subset this tool actually uses is declared.
 */
declare module 'railroad-diagrams' {
  export interface DiagramPart {
    addTo(parent: Element): SVGElement;
    toSVG(): SVGElement;
    toString(): string;
  }

  export type DiagramItem = string | DiagramPart;

  export function Diagram(...items: DiagramItem[]): DiagramPart;
  export function Sequence(...items: DiagramItem[]): DiagramPart;
  export function Choice(normal: number, ...items: DiagramItem[]): DiagramPart;
  export function Optional(item: DiagramItem, skip?: 'skip'): DiagramPart;
  export function OneOrMore(item: DiagramItem, rep?: DiagramItem): DiagramPart;
  export function ZeroOrMore(item: DiagramItem, rep?: DiagramItem, skip?: 'skip'): DiagramPart;
  export function Terminal(text: string): DiagramPart;
  export function NonTerminal(text: string): DiagramPart;
  export function Comment(text: string): DiagramPart;
  export function Skip(): DiagramPart;
}
