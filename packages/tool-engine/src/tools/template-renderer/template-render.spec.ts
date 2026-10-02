import { buildTemplateRenderCode } from "./template-render.js";

const FAKE_EJS_RUNTIME = 'var ejs = { render: function (t, d) { return t + JSON.stringify(d); } };';

describe('buildTemplateRenderCode', () => {
  it('embeds the template and parsed context, and calls ejs.render', () => {
    const result = buildTemplateRenderCode('Hello <%= name %>', '{"name":"World"}', FAKE_EJS_RUNTIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain(FAKE_EJS_RUNTIME);
    expect(result.code).toContain('ejs.render("Hello <%= name %>", {"name":"World"})');
  });

  it('treats an empty context as an empty object', () => {
    const result = buildTemplateRenderCode('static', '   ', FAKE_EJS_RUNTIME);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('ejs.render("static", {})');
  });

  it('reports invalid JSON without building sandbox code', () => {
    const result = buildTemplateRenderCode('x', '{not json', FAKE_EJS_RUNTIME);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('Invalid JSON context');
  });
});
