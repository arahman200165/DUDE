import { buildCurlCommand } from "@dude/tool-engine/shared/http-request/curl-build";
import { parseCurl } from "@dude/tool-engine/tools/curl-converter/curl-parse";

const FIXTURES = [
  `curl -X POST https://api.example.com/users?active=true -H "Authorization: Bearer abc" -d 'a=1&b=2'`,
  'curl https://example.com',
  `curl -u alice:secret https://example.com/secure`,
  `curl -X PUT https://example.com -F 'name=value' -F 'file=@photo.png'`,
  `curl -d "It's a test" https://example.com`,
];

describe('buildCurlCommand', () => {
  it('round-trips structurally through parseCurl for a variety of requests', () => {
    for (const fixture of FIXTURES) {
      const original = parseCurl(fixture).request;
      const rebuilt = parseCurl(buildCurlCommand(original)).request;
      expect(rebuilt).toEqual(original);
    }
  });

  it('always emits -X explicitly, even for GET', () => {
    const request = parseCurl('curl https://example.com').request;
    expect(buildCurlCommand(request)).toContain('-X GET');
  });

  it('escapes an embedded single quote in the body', () => {
    const request = parseCurl(`curl -d "It's a test" https://example.com`).request;
    expect(buildCurlCommand(request)).toBe(`curl -X POST 'https://example.com' -d 'It'\\''s a test'`);
  });
});
