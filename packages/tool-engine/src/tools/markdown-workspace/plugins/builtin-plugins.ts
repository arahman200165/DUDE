import { MarkdownPluginManifest } from "./plugin-manifest.model.js";

/**
 * Realigns every GFM pipe-table's column widths and alignment markers.
 * Written as plain ES5-ish JS (not TypeScript) because this is the literal
 * `source` a `MarkdownPluginManifest` runs inside the sandboxed plugin
 * iframe via a global `run(input)` -- see `plugin-sandbox-doc.ts`. Kept
 * dependency-free and framework-free on purpose, same constraint as any
 * other plugin source a user could paste in by hand.
 */
const TABLE_FORMATTER_SOURCE = `
function run(input) {
  var lines = input.split('\\n');
  var out = [];
  var i = 0;
  while (i < lines.length) {
    if (isTableHeader(lines, i)) {
      var block = [lines[i], lines[i + 1]];
      var j = i + 2;
      while (j < lines.length && lines[j].indexOf('|') !== -1 && lines[j].trim() !== '') {
        block.push(lines[j]);
        j++;
      }
      out = out.concat(formatTable(block));
      i = j;
    } else {
      out.push(lines[i]);
      i++;
    }
  }
  return out.join('\\n');
}

function isTableHeader(lines, i) {
  if (i + 1 >= lines.length) return false;
  if (lines[i].indexOf('|') === -1) return false;
  return /^\\s*\\|?(\\s*:?-+:?\\s*\\|)*\\s*:?-+:?\\s*\\|?\\s*$/.test(lines[i + 1]);
}

function splitRow(line) {
  var trimmed = line.trim();
  if (trimmed.charAt(0) === '|') trimmed = trimmed.slice(1);
  if (trimmed.charAt(trimmed.length - 1) === '|') trimmed = trimmed.slice(0, -1);
  var cells = [];
  var buf = '';
  for (var k = 0; k < trimmed.length; k++) {
    var ch = trimmed.charAt(k);
    if (ch === '\\\\' && trimmed.charAt(k + 1) === '|') {
      buf += '|';
      k++;
      continue;
    }
    if (ch === '|') {
      cells.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  cells.push(buf.trim());
  return cells;
}

function parseAlign(cell) {
  var left = cell.charAt(0) === ':';
  var right = cell.charAt(cell.length - 1) === ':';
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}

function repeatChar(ch, n) {
  var s = '';
  for (var k = 0; k < n; k++) s += ch;
  return s;
}

function padCell(text, width, align) {
  var diff = width - text.length;
  if (diff <= 0) return text;
  if (align === 'right') return repeatChar(' ', diff) + text;
  if (align === 'center') {
    var l = Math.floor(diff / 2);
    return repeatChar(' ', l) + text + repeatChar(' ', diff - l);
  }
  return text + repeatChar(' ', diff);
}

function formatRow(cells, widths, aligns) {
  var parts = [];
  for (var c = 0; c < widths.length; c++) {
    parts.push(' ' + padCell(cells[c] || '', widths[c], aligns[c] || 'none') + ' ');
  }
  return '|' + parts.join('|') + '|';
}

function formatSeparator(widths, aligns) {
  var parts = [];
  for (var c = 0; c < widths.length; c++) {
    var w = widths[c];
    var align = aligns[c] || 'none';
    if (align === 'center') parts.push(' :' + repeatChar('-', Math.max(1, w - 2)) + ': ');
    else if (align === 'left') parts.push(' :' + repeatChar('-', Math.max(1, w - 1)) + ' ');
    else if (align === 'right') parts.push(' ' + repeatChar('-', Math.max(1, w - 1)) + ': ');
    else parts.push(' ' + repeatChar('-', w) + ' ');
  }
  return '|' + parts.join('|') + '|';
}

function formatTable(block) {
  var header = splitRow(block[0]);
  var aligns = splitRow(block[1]).map(parseAlign);
  var rows = block.slice(2).map(splitRow);
  var widths = [];
  for (var c = 0; c < header.length; c++) {
    var w = Math.max(3, (header[c] || '').length);
    for (var r = 0; r < rows.length; r++) w = Math.max(w, (rows[r][c] || '').length);
    widths.push(w);
  }
  var lines = [formatRow(header, widths, aligns), formatSeparator(widths, aligns)];
  for (var r2 = 0; r2 < rows.length; r2++) lines.push(formatRow(rows[r2], widths, aligns));
  return lines;
}
`.trim();

export const TABLE_FORMATTER_PLUGIN: MarkdownPluginManifest = {
  id: 'builtin-table-formatter',
  name: 'Table Formatter (built-in)',
  kind: 'toolbar-action',
  description: 'Realigns the selected GFM pipe-table’s column widths and alignment markers.',
  source: TABLE_FORMATTER_SOURCE,
};

/**
 * Seeded into the plugins signal's default value only -- an install that
 * already has a persisted (empty) plugin list from before this milestone
 * won't retroactively gain it. Treated exactly like a user-added plugin
 * otherwise (removable, runs through the same sandboxed iframe).
 */
export const BUILT_IN_PLUGINS: readonly MarkdownPluginManifest[] = [TABLE_FORMATTER_PLUGIN];
