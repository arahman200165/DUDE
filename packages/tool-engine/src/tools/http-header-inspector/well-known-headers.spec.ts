import { describeHeader } from "./well-known-headers.js";

describe('describeHeader', () => {
  it('looks up a well-known header case-insensitively', () => {
    expect(describeHeader('content-type')).toBe('Media type of the request/response body.');
    expect(describeHeader('CONTENT-TYPE')).toBe('Media type of the request/response body.');
  });

  it('returns undefined for an unrecognized header name', () => {
    expect(describeHeader('X-My-Custom-Header')).toBeUndefined();
  });
});
