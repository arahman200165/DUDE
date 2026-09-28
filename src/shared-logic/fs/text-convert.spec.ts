import { convertText, DEFAULT_CONVERT, detectEol, inventory } from './text-convert';
import { editorConfigToOptions, parseEditorConfig, resolveEditorConfig } from './editorconfig';

const opts = (overrides: Partial<typeof DEFAULT_CONVERT>) => ({ ...DEFAULT_CONVERT, eol: 'keep' as const, ...overrides });

describe('text conversion', () => {
  it('converts line endings in either direction and reports mixed files', () => {
    expect(convertText('a\r\nb\nc\r', opts({ eol: 'lf' }))).toEqual({ text: 'a\nb\nc\n', changes: ['MIXED → LF'] });
    expect(convertText('a\nb\n', opts({ eol: 'crlf' })).text).toBe('a\r\nb\r\n');
    expect(convertText('a\nb', opts({ eol: 'lf' })).changes).toEqual([]);
    expect(detectEol('a\r\nb\r\n')).toBe('crlf');
    expect(detectEol('single line')).toBe('none');
  });

  it('ensures or strips the final newline using the file’s own line ending', () => {
    expect(convertText('a\r\nb', opts({ finalNewline: 'ensure' })).text).toBe('a\r\nb\r\n');
    expect(convertText('a\nb\n\n\n', opts({ finalNewline: 'strip' })).text).toBe('a\nb');
    expect(convertText('', opts({ finalNewline: 'ensure' })).text).toBe('');
  });

  it('trims trailing whitespace and converts leading indentation only', () => {
    expect(convertText('x  \n\ty\t\n', opts({ trimTrailing: true })).text).toBe('x\n\ty\n');
    expect(convertText('\tif (a) {\n\t\treturn "\ttab";\n', opts({ indent: 'spaces', indentSize: 2 })).text).toBe('  if (a) {\n    return "\ttab";\n');
    expect(convertText('      six\n   three\n', opts({ indent: 'tabs', indentSize: 4 })).text).toBe('\t  six\n   three\n');
    expect(convertText('  \tx', opts({ indent: 'spaces', indentSize: 4 })).text).toBe('    x');
  });

  it('inventories a file', () => {
    expect(inventory('\tone  \r\ntwo\r\n')).toEqual({ eol: 'crlf', finalNewline: true, trailingWhitespaceLines: 1, indent: 'tabs' });
  });
});

describe('editorconfig', () => {
  const files = new Map([
    ['', parseEditorConfig('root = true\n[*]\nend_of_line = lf\ninsert_final_newline = true\ncharset = utf-8\n\n[*.{cmd,bat}]\nend_of_line = crlf\n\n[Makefile]\nindent_style = tab\n', '')],
    ['legacy', parseEditorConfig('[*.txt]\ncharset = latin1\nend_of_line = crlf\ntrim_trailing_whitespace = true\nindent_style = space\nindent_size = 2\n', 'legacy')],
  ]);

  it('resolves sections root-first with later sections and deeper files winning', () => {
    expect(resolveEditorConfig('src/app.ts', files)).toEqual({ end_of_line: 'lf', insert_final_newline: 'true', charset: 'utf-8' });
    expect(resolveEditorConfig('build/run.cmd', files)['end_of_line']).toBe('crlf');
    expect(resolveEditorConfig('sub/Makefile', files)['indent_style']).toBe('tab');
    expect(resolveEditorConfig('legacy/notes.txt', files)).toMatchObject({ end_of_line: 'crlf', charset: 'latin1', insert_final_newline: 'true' });
  });

  it('maps properties onto converter options', () => {
    expect(editorConfigToOptions(resolveEditorConfig('legacy/notes.txt', files))).toEqual({ eol: 'crlf', encoding: 'latin1', bom: 'strip', finalNewline: 'ensure', trimTrailing: true, indent: 'spaces', indentSize: 2, editorconfig: true });
    expect(editorConfigToOptions({ charset: 'utf-8-bom', insert_final_newline: 'false' })).toMatchObject({ encoding: 'utf8', bom: 'add', finalNewline: 'strip', eol: 'keep', indent: 'keep' });
  });
});
