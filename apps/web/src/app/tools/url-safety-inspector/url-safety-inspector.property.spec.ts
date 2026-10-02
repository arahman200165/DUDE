import fc from 'fast-check';
import { describe, it } from 'vitest';
import { invariant, neverThrows } from "../../../../../../tests/property-harness";
import { UrlSafetyReport, inspectUrlSafety } from "@dude/tool-engine/tools/url-safety-inspector/url-safety-inspect";

const KNOWN_FINDING_IDS = new Set(['userinfo', 'ip-literal', 'mixed-script', 'punycode', 'suspicious-tld', 'deep-subdomain']);

describe('inspectUrlSafety fuzzing', () => {
  it('never throws for arbitrary text', () => {
    neverThrows((raw: string) => inspectUrlSafety(raw), fc.string(), {
      assertShape: (result) => {
        if (typeof (result as { ok: boolean }).ok !== 'boolean') throw new Error('expected a UrlSafetyResult');
      },
    });
  });

  it('every finding (when ok) has a known id and a non-empty message, with homograph analysis only for non-numeric hosts', () => {
    invariant(inspectUrlSafety, fc.webUrl(), (result) => {
      if (!result.ok) return true;
      const r = result as UrlSafetyReport;
      const findingsValid = r.findings.every((f) => KNOWN_FINDING_IDS.has(f.id) && f.message.length > 0);
      const ipLiteral = r.findings.some((f) => f.id === 'ip-literal');
      const homographConsistent = ipLiteral ? r.homograph === null : true;
      return findingsValid && homographConsistent;
    });
  });
});
