import { buildPluginSrcdoc } from "@dude/tool-engine/tools/markdown-workspace/plugins/plugin-sandbox-doc";

describe('buildPluginSrcdoc', () => {
  it('embeds the plugin source verbatim', () => {
    const doc = buildPluginSrcdoc('function run(input) { return input.toUpperCase(); }');
    expect(doc).toContain('function run(input) { return input.toUpperCase(); }');
  });

  it('includes a CSP blocking network access', () => {
    const doc = buildPluginSrcdoc('function run(input) { return input; }');
    expect(doc).toContain("connect-src 'none'");
  });

  it('wires a message listener that calls run() and posts back a response', () => {
    const doc = buildPluginSrcdoc('function run(input) { return input; }');
    expect(doc).toContain('window.addEventListener(\'message\'');
    expect(doc).toContain('parent.postMessage');
  });
});
