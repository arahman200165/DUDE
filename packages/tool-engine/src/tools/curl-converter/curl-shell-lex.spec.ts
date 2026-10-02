import { tokenizeShellCommand } from "./curl-shell-lex.js";

describe('tokenizeShellCommand', () => {
  it('splits whitespace-separated tokens', () => {
    expect(tokenizeShellCommand('curl -X GET https://example.com')).toEqual([
      'curl',
      '-X',
      'GET',
      'https://example.com',
    ]);
  });

  it('treats single-quoted content as fully literal', () => {
    expect(tokenizeShellCommand(`curl -d 'a=1&b="two"'`)).toEqual(['curl', '-d', 'a=1&b="two"']);
  });

  it('unescapes \\" \\\\ \\$ and \\` inside double quotes, keeping other backslashes literal', () => {
    expect(tokenizeShellCommand('curl -H "Name: \\"quoted\\" and \\\\n literal"')).toEqual([
      'curl',
      '-H',
      'Name: "quoted" and \\n literal',
    ]);
  });

  it('unescapes a backslash-escaped character outside quotes', () => {
    expect(tokenizeShellCommand('curl https://example.com\\?a=1')).toEqual(['curl', 'https://example.com?a=1']);
  });

  it('joins lines ending in a trailing backslash, using the next line\'s leading whitespace as the separator', () => {
    const command = 'curl https://example.com \\\n  -H "Accept: */*" \\\n  -d "a=1"';
    expect(tokenizeShellCommand(command)).toEqual([
      'curl',
      'https://example.com',
      '-H',
      'Accept: */*',
      '-d',
      'a=1',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(tokenizeShellCommand('')).toEqual([]);
    expect(tokenizeShellCommand('   ')).toEqual([]);
  });
});
