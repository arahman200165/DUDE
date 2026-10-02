import fc from 'fast-check';
import { roundTrip } from "../../../../../../tests/property-harness";
import { permissionsToSymbolic, symbolicToPermissions, type Permissions } from "@dude/tool-engine/tools/chmod-converter/chmod-convert";

describe('chmod conversion properties', () => {
  it('round-trips permissions through symbolic notation', () => {
    const permissions: fc.Arbitrary<Permissions> = fc.record({
      special: fc.record({ setuid: fc.boolean(), setgid: fc.boolean(), sticky: fc.boolean() }),
      owner: fc.record({ read: fc.boolean(), write: fc.boolean(), execute: fc.boolean() }),
      group: fc.record({ read: fc.boolean(), write: fc.boolean(), execute: fc.boolean() }),
      other: fc.record({ read: fc.boolean(), write: fc.boolean(), execute: fc.boolean() }),
    });
    roundTrip((value: Permissions) => permissionsToSymbolic(value), (symbolic) => {
      const parsed = symbolicToPermissions(String(symbolic));
      if (!parsed.ok) throw new Error(parsed.error);
      return parsed.permissions;
    }, permissions);
  });
});
