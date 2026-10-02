import fc from 'fast-check';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { convertIni } from "@dude/tool-engine/tools/ini-formatter/ini-convert";

describe('convertIni properties', () => {
  it('round-trips flat string values through INI and JSON', () => {
    invariant((value) => {
      const toIni = convertIni(JSON.stringify({ key: value }), 'json-to-ini');
      if (!toIni.ok) return false;
      const back = convertIni(toIni.output, 'ini-to-json');
      return back.ok && JSON.parse(back.output).key === value;
    }, fc.stringMatching(/^[a-zA-Z0-9 _.-]{1,20}$/), Boolean);
  });
  it('handles arbitrary input in either direction without throwing', () => {
    neverThrows(([input, direction]) => convertIni(input, direction), fc.tuple(fc.string(), fc.constantFrom('ini-to-json' as const, 'json-to-ini' as const)));
  });
});
