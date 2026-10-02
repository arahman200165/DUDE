import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { testSelector } from './css-selector-tester-logic';

/**
 * Pipeline-step adapter for the CSS Selector Tester tool. Testing a selector fundamentally
 * needs two documents (a selector *and* sample HTML to test it against) — since the HTML side
 * can default to a fixed sample document, this stays single-input: the piped text is the
 * selector, tested against a small fixed sample document representative of common markup.
 */
const SAMPLE_HTML = `
<div id="app" class="container">
  <header class="site-header">
    <h1 class="title">Sample</h1>
    <nav class="nav"><a href="#" class="nav-link active">Home</a><a href="#" class="nav-link">About</a></nav>
  </header>
  <main>
    <ul class="list">
      <li class="item">One</li>
      <li class="item featured">Two</li>
      <li class="item">Three</li>
    </ul>
    <p data-role="note">A note.</p>
  </main>
</div>
`.trim();

export const pipelineStep: PipelineStep = {
  accepts: ['text'],
  produces: ['json'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'text') {
      return { ok: false, error: { message: 'CSS Selector Tester expects text input.', kind: 'invalid-input' } };
    }

    const result = testSelector(SAMPLE_HTML, input.value);
    return result.ok
      ? { ok: true, output: { type: 'json', value: { elements: result.elements, matchCount: result.matchCount } } }
      : { ok: false, error: { message: result.error, kind: 'invalid-input' } };
  },
};
