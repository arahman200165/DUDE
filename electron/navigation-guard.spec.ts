import { isAllowedRendererNavigation } from './navigation-guard';

describe('renderer navigation origin guard', () => {
  const base = 'http://127.0.0.1:49731/';
  it('accepts only the exact app origin and port', () => {
    expect(isAllowedRendererNavigation('http://127.0.0.1:49731/tools/json', base)).toBe(true);
    expect(isAllowedRendererNavigation('http://127.0.0.1:49732/tools/json', base)).toBe(false);
    expect(isAllowedRendererNavigation('https://example.test/', base)).toBe(false);
    expect(isAllowedRendererNavigation('file:///C:/secret.txt', base)).toBe(false);
    expect(isAllowedRendererNavigation('dude://open/tool/json', base)).toBe(false);
    expect(isAllowedRendererNavigation('not a URL', base)).toBe(false);
  });
});
