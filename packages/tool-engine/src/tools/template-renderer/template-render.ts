/**
 * Builds the sandbox "code" string for one EJS render. EJS's `ejs.render`
 * compiles a template to a real JS `Function` via `new Function(...)` under
 * the hood — a template body of `<% while(true){} %>` is exactly as
 * arbitrary as a JS Playground snippet, so it runs through the identical
 * `code-sandbox` (iframe + terminated Worker), not a lighter one. The
 * self-contained `ejs.min.js` client bundle (fetched once by
 * `ejs-runtime.ts` and passed in here) is prepended so `ejs` is a real
 * global inside the sandbox worker; the isolation comes entirely from that
 * sandbox, not from any EJS-specific option — EJS's own `with()`-based
 * scoping (the default, giving templates plain `<%= name %>` access to
 * context properties instead of requiring `locals.name`) is a usability
 * choice, not a security boundary.
 */
export type TemplateRenderCode = { readonly ok: true; readonly code: string } | { readonly ok: false; readonly error: string };

export function buildTemplateRenderCode(template: string, contextJson: string, ejsRuntimeSource: string): TemplateRenderCode {
  let context: unknown = {};
  if (contextJson.trim() !== '') {
    try {
      context = JSON.parse(contextJson);
    } catch (err) {
      return { ok: false, error: `Invalid JSON context: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const code = `${ejsRuntimeSource}\nreturn ejs.render(${JSON.stringify(template)}, ${JSON.stringify(context)});`;
  return { ok: true, code };
}
