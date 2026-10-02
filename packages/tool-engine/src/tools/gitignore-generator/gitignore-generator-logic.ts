import { GITIGNORE_TEMPLATES } from "./gitignore-templates-data.js";

/** Combines the selected templates into one deduplicated, section-headed `.gitignore`. */
export function combineGitignoreTemplates(ids: readonly string[]): string {
  const sections = ids
    .map((id) => GITIGNORE_TEMPLATES.find((template) => template.id === id))
    .filter((template): template is NonNullable<typeof template> => template !== undefined)
    .map((template) => `### ${template.label} ###\n${template.content}`);

  return sections.join('\n\n');
}
