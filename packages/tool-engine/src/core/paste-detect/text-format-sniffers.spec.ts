import { describe, expect, it } from 'vitest';
import {
  looksLikeCss,
  looksLikeDockerfile,
  looksLikeDotenv,
  looksLikeHtmlDocument,
  looksLikeKubernetesManifest,
  looksLikeSql,
  looksLikeStackTrace,
  looksLikeSvg,
  looksLikeXml,
  looksLikeYaml,
  markdownSignalCount,
  sniffDelimitedTable,
} from "./text-format-sniffers.js";

const PROSE = 'Meeting notes: we agreed to ship on Friday, pending review.\nAlice will follow up, Bob too.';

describe('text-format sniffers', () => {
  it('recognizes SVG with or without an XML prolog, and rejects unclosed markup', () => {
    expect(looksLikeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>')).toBe(true);
    expect(looksLikeSvg('<?xml version="1.0"?>\n<!-- icon -->\n<svg viewBox="0 0 1 1"/>')).toBe(true);
    expect(looksLikeSvg('<svg><rect/>')).toBe(false);
    expect(looksLikeSvg('<div><svg></svg></div>')).toBe(false);
  });

  it('recognizes HTML documents, not fragments', () => {
    expect(looksLikeHtmlDocument('<!DOCTYPE html>\n<html><body></body></html>')).toBe(true);
    expect(looksLikeHtmlDocument('<html lang="en">')).toBe(true);
    expect(looksLikeHtmlDocument('<div>hi</div>')).toBe(false);
  });

  it('recognizes XML by declaration or by a closed root element', () => {
    expect(looksLikeXml('<?xml version="1.0"?><note><to>x</to></note>')).toBe(true);
    expect(looksLikeXml('<project xmlns="x">\n  <a/>\n</project>')).toBe(true);
    expect(looksLikeXml('<ns:root>\n</ns:root>\n')).toBe(true);
    expect(looksLikeXml('<note>unclosed')).toBe(false);
    expect(looksLikeXml('<div>html fragment</div>')).toBe(false);
  });

  it('needs two distinct Markdown constructs', () => {
    expect(markdownSignalCount('# Title\n\n- one\n- two\n\nSee [docs](https://x.dev).')).toBe(3);
    expect(markdownSignalCount('- just a list\n- of things')).toBe(1);
    expect(markdownSignalCount(PROSE)).toBe(0);
  });

  it('recognizes YAML mappings but not JSON, prose, or bare lists', () => {
    expect(looksLikeYaml('name: dude\nversion: 1\ntags:\n  - a\n  - b\n')).toBe(true);
    expect(looksLikeYaml('---\n# comment\nkey: value\nother: 2')).toBe(true);
    expect(looksLikeYaml('{"a": 1,\n"b": 2}')).toBe(false);
    expect(looksLikeYaml('- one\n- two')).toBe(false);
    expect(looksLikeYaml(PROSE)).toBe(false);
  });

  it('recognizes Kubernetes manifests', () => {
    expect(looksLikeKubernetesManifest('apiVersion: v1\nkind: Pod\nmetadata:\n  name: x\n')).toBe(true);
    expect(looksLikeKubernetesManifest('name: x\nkind: thing\n')).toBe(false);
  });

  it('recognizes SQL statements', () => {
    expect(looksLikeSql('select id, name from users where id = 1')).toBe(true);
    expect(looksLikeSql('-- migration\nCREATE TABLE t (id int);')).toBe(true);
    expect(looksLikeSql('WITH x AS (SELECT 1) SELECT * FROM x')).toBe(true);
    expect(looksLikeSql('Please update the docs')).toBe(false);
  });

  it('sniffs consistent delimiters, rejecting JSON and single lines', () => {
    expect(sniffDelimitedTable('a,b,c\n1,2,3\n4,5,6')).toBe(',');
    expect(sniffDelimitedTable('a\tb\tc\n1\t2\t3')).toBe('\t');
    expect(sniffDelimitedTable('a;b;c\n1;2;3')).toBe(';');
    expect(sniffDelimitedTable('a,b\n1,2\n3,4\n5,6')).toBe(',');
    expect(sniffDelimitedTable('a,b\n1,2')).toBeNull();
    expect(sniffDelimitedTable('a,b,c')).toBeNull();
    expect(sniffDelimitedTable('[1,2,\n3,4]')).toBeNull();
    expect(sniffDelimitedTable(PROSE)).toBeNull();
  });

  it('recognizes CSS rules but not JSON or JS calls', () => {
    expect(looksLikeCss('.btn { color: red; padding: 4px }')).toBe(true);
    expect(looksLikeCss('/* x */\n@media (max-width: 600px) { .a { margin: 0; } }')).toBe(true);
    expect(looksLikeCss('{"a": 1}')).toBe(false);
    expect(looksLikeCss('foo({ a: 1 })')).toBe(false);
  });

  it('recognizes Dockerfiles, including ARG before FROM and line continuations', () => {
    expect(looksLikeDockerfile('ARG V=1\nFROM node:20\nRUN npm ci && \\\n  npm run build\nCMD ["node"]')).toBe(true);
    expect(looksLikeDockerfile('FROM here we go\nand then prose')).toBe(false);
  });

  it('recognizes dotenv files', () => {
    expect(looksLikeDotenv('# settings\nAPI_URL=https://x\nexport DEBUG=1\n')).toBe(true);
    expect(looksLikeDotenv('API_URL=https://x')).toBe(false);
    expect(looksLikeDotenv('a = b\nc = d')).toBe(false);
  });

  it('recognizes stack traces', () => {
    expect(looksLikeStackTrace('TypeError: x is undefined\n    at foo (app.js:1:2)\n    at bar (app.js:3:4)')).toBe(true);
    expect(looksLikeStackTrace('Traceback (most recent call last):\n  File "a.py", line 1, in <module>')).toBe(true);
    expect(looksLikeStackTrace('look at this')).toBe(false);
  });

  it('stays bounded on very large input', () => {
    const huge = 'a,b\n'.repeat(500_000);
    const start = performance.now();
    sniffDelimitedTable(huge);
    looksLikeSql(huge);
    looksLikeYaml(huge);
    looksLikeXml(huge);
    markdownSignalCount(huge);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
