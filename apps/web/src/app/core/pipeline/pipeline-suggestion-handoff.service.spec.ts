import { PipelineSuggestionHandoffService } from './pipeline-suggestion-handoff.service';

describe('PipelineSuggestionHandoffService', () => {
  it('returns null when nothing was offered', () => {
    const service = new PipelineSuggestionHandoffService();
    expect(service.consume()).toBeNull();
  });

  it('returns the offered value once, then null', () => {
    const service = new PipelineSuggestionHandoffService();
    service.offer(['base64', 'json']);

    expect(service.consume()).toEqual(['base64', 'json']);
    expect(service.consume()).toBeNull();
  });
});
