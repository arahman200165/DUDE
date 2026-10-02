import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { HTML_ENTITY_TABLE, filterEntityTable } from './html-entity-explorer-logic';

/**
 * Pipeline-step adapter for the HTML Entity Explorer tool — a reference lookup, not a
 * transform. The piped text is used as a search query against the entity table (matching by
 * name, character, decimal, or hex codepoint); an empty query returns the full table. The
 * result is formatted as `text` (one "name<TAB>char<TAB>decimal<TAB>hex" line per match) to
 * match the tool's declared `text -> text` io — the underlying `filterEntityTable` actually
 * returns a richer list of entries, collapsed here into a single text value.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['text'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'HTML Entity Explorer expects text input.', kind: 'invalid-input' } };
    }

    const matches = filterEntityTable(HTML_ENTITY_TABLE, input.value);
    if (matches.length === 0) {
      return { ok: false, error: { message: `No HTML entity matches "${input.value}".`, kind: 'invalid-input' } };
    }

    const text = matches.map((entry) => `${entry.name}\t${entry.char}\t${entry.decimal}\t${entry.hex}`).join('\n');
    return { ok: true, output: { type: 'text', value: text } };
  },
};
