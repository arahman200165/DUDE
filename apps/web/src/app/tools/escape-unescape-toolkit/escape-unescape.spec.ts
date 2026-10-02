import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { EscapeMode, escapeText, unescapeText } from "@dude/tool-engine/tools/escape-unescape-toolkit/escape-unescape";

describe('JavaScript', () => {
  it('escapes quotes, backslashes, and newlines', () => {
    const escaped = escapeText('He said "hi"\n\\tab', 'javascript');
    expect(escaped).toEqual({ ok: true, value: 'He said \\"hi\\"\\n\\\\tab' });
  });

  it('round-trips', () => {
    const text = `It's "quoted"\nand\ttabbed`;
    const escaped = escapeText(text, 'javascript');
    expect(escaped.ok && unescapeText(escaped.value, 'javascript')).toEqual({ ok: true, value: text });
  });

  it('rejects invalid escape input', () => {
    expect(unescapeText('\\x', 'javascript').ok).toBe(false);
  });
});

describe('CSS', () => {
  it('round-trips special characters', () => {
    const text = '.my#class:name';
    const escaped = escapeText(text, 'css');
    expect(escaped.ok && unescapeText(escaped.value, 'css')).toEqual({ ok: true, value: text });
  });
});

describe('SQL', () => {
  it('doubles single quotes and reverses it', () => {
    expect(escapeText("O'Brien", 'sql')).toEqual({ ok: true, value: "O''Brien" });
    expect(unescapeText("O''Brien", 'sql')).toEqual({ ok: true, value: "O'Brien" });
  });
});

describe('Shell', () => {
  it('wraps in single quotes and escapes embedded quotes', () => {
    expect(escapeText("it's here", 'shell')).toEqual({ ok: true, value: "'it'\\''s here'" });
  });

  it('round-trips through its own escaping', () => {
    const text = `a 'quoted' $value with "double" and \\backslash`;
    const escaped = escapeText(text, 'shell');
    expect(escaped.ok && unescapeText(escaped.value, 'shell')).toEqual({ ok: true, value: text });
  });

  it('rejects an unterminated quote', () => {
    expect(unescapeText("'unterminated", 'shell').ok).toBe(false);
  });
});

describe('PowerShell', () => {
  it('wraps in single quotes and doubles embedded quotes', () => {
    expect(escapeText("O'Brien", 'powershell')).toEqual({ ok: true, value: "'O''Brien'" });
  });

  it('round-trips', () => {
    const text = "path with 'quotes' inside";
    const escaped = escapeText(text, 'powershell');
    expect(escaped.ok && unescapeText(escaped.value, 'powershell')).toEqual({ ok: true, value: text });
  });
});

describe('Quoted-Printable', () => {
  it('encodes non-printable/high bytes and passes through printable ASCII', () => {
    expect(escapeText('Café=100%', 'quoted-printable')).toEqual({ ok: true, value: 'Caf=C3=A9=3D100%' });
  });

  it('round-trips', () => {
    const text = 'Héllo=World, tab\ttab';
    const escaped = escapeText(text, 'quoted-printable');
    expect(escaped.ok && unescapeText(escaped.value, 'quoted-printable')).toEqual({ ok: true, value: text });
  });

  it('rejects an invalid escape sequence', () => {
    expect(unescapeText('=ZZ', 'quoted-printable').ok).toBe(false);
  });
});

describe('every mode round-trips plain ASCII text', () => {
  const modes: readonly EscapeMode[] = ['javascript', 'css', 'sql', 'shell', 'powershell', 'quoted-printable'];
  for (const mode of modes) {
    it(`round-trips through ${mode}`, () => {
      const text = 'Hello, world 123';
      const escaped = escapeText(text, mode);
      expect(escaped.ok && unescapeText(escaped.value, mode)).toEqual({ ok: true, value: text });
    });
  }
});

describe('round-trip property (DUDE_PRD.md §21 Phase 23 Item 4)', () => {
  // quoted-printable round-trips through TextEncoder (UTF-8), and javascript/css both round-trip a
  // lone surrogate fine (JSON.stringify/CSS.escape both represent it as a \uXXXX-style escape) --
  // but TextEncoder replaces a lone surrogate with U+FFFD, so only quoted-printable needs this filter.
  const wellFormedText = fc.string().filter((s) => !/[\uD800-\uDFFF]/.test(s) || /^(?:[^\uD800-\uDFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/.test(s));

  const roundTrips = (mode: EscapeMode, text: string) => {
    const escaped = escapeText(text, mode);
    expect(escaped.ok).toBe(true);
    if (!escaped.ok) return;
    expect(unescapeText(escaped.value, mode)).toEqual({ ok: true, value: text });
  };

  it('round-trips through javascript for arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (text) => roundTrips('javascript', text)));
  });

  it('round-trips through css for arbitrary well-formed text', () => {
    fc.assert(fc.property(wellFormedText, (text) => roundTrips('css', text)));
  });

  it('round-trips through sql for arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (text) => roundTrips('sql', text)));
  });

  it('round-trips through shell for arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (text) => roundTrips('shell', text)));
  });

  it('round-trips through powershell for arbitrary text', () => {
    fc.assert(fc.property(fc.string(), (text) => roundTrips('powershell', text)));
  });

  it('round-trips through quoted-printable for arbitrary well-formed text', () => {
    fc.assert(fc.property(wellFormedText, (text) => roundTrips('quoted-printable', text)));
  });
});

describe('fuzzing (DUDE_PRD.md §21 Phase 23 Item 5)', () => {
  const modes: readonly EscapeMode[] = ['javascript', 'css', 'sql', 'shell', 'powershell', 'quoted-printable'];
  const modeArb = fc.constantFrom(...modes);
  const textAndMode = fc.tuple(fc.string(), modeArb);

  it('escapeText never throws for arbitrary text input, in any mode', () => {
    neverThrows(([text, mode]) => escapeText(text, mode), textAndMode);
  });

  it('unescapeText never throws for arbitrary text input, in any mode', () => {
    neverThrows(([text, mode]) => unescapeText(text, mode), textAndMode);
  });
});
