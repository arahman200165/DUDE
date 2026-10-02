import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { textFileInputOf } from '../text-file-input/imported-file-flags';
import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { PASTE_DETECTORS } from "@dude/tool-engine/core/paste-detect/paste-detectors";
import { detectShapes } from "@dude/tool-engine/core/paste-detect/paste-detect";
import { encodeBase64 } from "@dude/crypto/base64-codec";
import { generateUuid } from "@dude/tool-engine/tools/uuid/uuid-tool";
import { generateUlid } from "@dude/tool-engine/tools/ulid-tools/ulid-logic";
import { generateKsuid } from "@dude/tool-engine/tools/ksuid-tools/ksuid-logic";

const getTool = (id: string) => TOOL_DEFINITIONS.find((definition) => definition.id === id);

describe('PASTE_DETECTORS registry coverage', () => {
  it('every detector references a real, text-accepting tool', () => {
    for (const detector of PASTE_DETECTORS) {
      const tool = getTool(detector.toolId);
      expect(tool, `"${detector.toolId}" is not a real TOOL_DEFINITIONS id`).toBeDefined();
      expect(tool?.io.accepts, `"${detector.toolId}"'s io.accepts should include 'text'`).toContain('text');
    }
  });

  // The user-visible bug this guards: Smart Paste suggests a tool, navigates there, and the pasted
  // value is silently gone because that tool has no way to receive it.
  it('every detector target can actually receive the pasted value', () => {
    for (const detector of PASTE_DETECTORS) {
      const tool = getTool(detector.toolId)!;
      const source = readFileSync(resolve(process.cwd(), 'apps/web/src/app/tools', tool.id, `${tool.id}.ts`), 'utf8');
      expect(
        source.includes(`.consume('${tool.id}')`) || textFileInputOf(tool) !== undefined,
        `"${tool.id}" is a Smart Paste target but neither consumes PasteHandoffService nor declares a text input (fileInput / desktopOpen.inputKey)`,
      ).toBe(true);
    }
  });

  it('has no duplicate toolIds', () => {
    const ids = PASTE_DETECTORS.map((detector) => detector.toolId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

/**
 * Sample-based regression check: feed one realistic value per shape through the full detector
 * set and assert the *intended* tool wins top rank. Guards against a future detector becoming
 * accidentally over-eager and drowning out a more specific match for the same input.
 *
 * `unix-timestamp` and `snowflake-id-tools` are deliberately excluded from the "wins top rank"
 * assertion below: any large decimal integer structurally satisfies both, and `snowflake-id-tools`
 * is intentionally scored low-confidence (see AGENTS.md) so it surfaces as a secondary candidate,
 * not the top match, for a plausibly-Snowflake-shaped number.
 */
describe('detectShapes sample regression', () => {
  it('returns [] for empty/whitespace input', () => {
    expect(detectShapes('', PASTE_DETECTORS, getTool)).toEqual([]);
    expect(detectShapes('   ', PASTE_DETECTORS, getTool)).toEqual([]);
  });

  const uuidSample = generateUuid('v4');
  const base64Sample = encodeBase64('Hello, DUDE! This is a paste-detection sample.');

  it.each<[string, string]>([
    ['jwt', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'],
    ['uuid', uuidSample.ok ? uuidSample.value : ''],
    ['ulid-tools', generateUlid(false)],
    ['ksuid-tools', generateKsuid()],
    ['ip-address-inspector', '192.168.1.1'],
    ['json', '{"a":1,"b":[2,3]}'],
    ['url-inspector', 'https://example.com/path?x=1'],
    ['color-converter', '#3b82f6'],
    ['base64', base64Sample.ok ? base64Sample.value : ''],
    ['unix-timestamp', '1700000000'],
    ['svg-viewer', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle r="4"/></svg>'],
    ['html-formatter', '<!doctype html>\n<html><head><title>x</title></head><body></body></html>'],
    ['xml-formatter', '<?xml version="1.0"?>\n<catalog><book id="1"/></catalog>'],
    ['dockerfile-linter', 'FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci'],
    ['k8s-manifest-validator', 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\n'],
    ['yaml-json', 'name: dude\nversion: 2\nfeatures:\n  - paste\n  - drop\n'],
    ['sql-formatter-tool', 'SELECT id, email FROM users WHERE active = 1 ORDER BY id'],
    ['stack-trace-formatter', 'Error: boom\n    at run (/app/index.js:10:5)\n    at main (/app/index.js:20:3)'],
    ['env-editor', 'DATABASE_URL=postgres://x\nDEBUG=true\n'],
    ['css-formatter', '.card { border: 1px solid #333; padding: 8px; }'],
    ['csv-viewer', 'id,name,email\n1,Ada,ada@x.dev\n2,Linus,linus@x.dev'],
    ['markdown', '# Release notes\n\n- Faster **paste** detection\n- See [docs](https://example.com)'],
  ])('"%s" wins top rank for its sample value', (expectedId, sample) => {
    const matches = detectShapes(sample, PASTE_DETECTORS, getTool);
    expect(matches[0]?.toolId).toBe(expectedId);
  });

  it('surfaces snowflake-id-tools as a candidate (not necessarily top-ranked) for a plausible Snowflake id', () => {
    const matches = detectShapes('175928847299117063', PASTE_DETECTORS, getTool);
    expect(matches.some((match) => match.toolId === 'snowflake-id-tools')).toBe(true);
  });
});

describe('text-format detectors stay out of the way', () => {
  it('never claims ordinary prose', () => {
    expect(detectShapes('Hi team, the build is green again. Thanks for the quick fix!', PASTE_DETECTORS, getTool)).toEqual([]);
  });

  it('keeps JSON on the JSON Formatter, ahead of any document-format match', () => {
    const matches = detectShapes('{\n  "name": "dude",\n  "tags": ["a", "b"]\n}', PASTE_DETECTORS, getTool);
    expect(matches[0]?.toolId).toBe('json');
    expect(matches.map((match) => match.toolId)).not.toContain('yaml-json');
  });

  it('does not also offer YAML for a stack trace', () => {
    const matches = detectShapes('Error: boom\n    at run (/a.js:1:1)\n    at main (/a.js:2:2)', PASTE_DETECTORS, getTool);
    expect(matches.map((match) => match.toolId)).toEqual(['stack-trace-formatter']);
  });

  it('ranks SVG above generic XML', () => {
    const matches = detectShapes('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', PASTE_DETECTORS, getTool);
    expect(matches[0]?.toolId).toBe('svg-viewer');
    expect(matches.map((match) => match.toolId)).not.toContain('xml-formatter');
  });
});
