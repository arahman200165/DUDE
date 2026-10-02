import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { buildAsn1Tree, oidLabel, oidName } from "./asn1-tree.js";

describe('asn1-tree', () => {
  describe('oidName / oidLabel', () => {
    it('resolves a known OID to its friendly name', () => {
      expect(oidName('2.5.4.3')).toBe('commonName');
      expect(oidLabel('2.5.4.3')).toBe('2.5.4.3 (commonName)');
    });

    it('falls back to the raw OID when unknown', () => {
      expect(oidName('1.2.3.4.5.6.7')).toBe('1.2.3.4.5.6.7');
      expect(oidLabel('1.2.3.4.5.6.7')).toBe('1.2.3.4.5.6.7');
    });
  });

  describe('buildAsn1Tree', () => {
    it('builds a tree for a simple SEQUENCE of INTEGER and OID', () => {
      const asn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, String.fromCharCode(42)),
        forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OID, false, forge.asn1.oidToDer('2.5.4.3').getBytes()),
      ]);

      const tree = buildAsn1Tree(asn1);
      expect(tree.typeName).toBe('SEQUENCE');
      expect(tree.constructed).toBe(true);
      expect(tree.children).toHaveLength(2);
      expect(tree.children[0].typeName).toBe('INTEGER');
      expect(tree.children[0].valuePreview).toBe('42');
      expect(tree.children[1].typeName).toBe('OBJECT IDENTIFIER');
      expect(tree.children[1].valuePreview).toBe('2.5.4.3 (commonName)');
    });

    it('reports a plausible byte length for a round-tripped structure', () => {
      const asn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.OCTETSTRING, false, 'hello');
      const tree = buildAsn1Tree(asn1);
      const der = forge.asn1.toDer(asn1);
      expect(tree.byteLength).toBe(der.length());
    });

    it('falls back to hex for an INTEGER too large for a 32-bit signed value', () => {
      const bigIntBytes = forge.asn1.integerToDer(0x7fffffff).getBytes() + '\xff\xff\xff\xff';
      const asn1 = forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.INTEGER, false, bigIntBytes);
      const tree = buildAsn1Tree(asn1);
      expect(tree.valuePreview).toMatch(/^0x[0-9a-f]+$/);
    });

    it('renders a context-specific tag by number instead of a UNIVERSAL type name', () => {
      const asn1 = forge.asn1.create(forge.asn1.Class.CONTEXT_SPECIFIC, 2, false, 'example.com');
      const tree = buildAsn1Tree(asn1);
      expect(tree.tagClassName).toBe('CONTEXT_SPECIFIC');
      expect(tree.typeName).toBe('[CONTEXT_SPECIFIC 2]');
    });

    it('renders BOOLEAN and NULL leaves', () => {
      const trueNode = buildAsn1Tree(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.BOOLEAN, false, '\xff'));
      expect(trueNode.valuePreview).toBe('TRUE');
      const nullNode = buildAsn1Tree(forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.NULL, false, ''));
      expect(nullNode.valuePreview).toBe('(null)');
    });
  });
});
