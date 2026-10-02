import { checkGrammar } from "./grammar-check.js";

describe('checkGrammar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects empty input without making a request', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await checkGrammar('');
    expect(result).toEqual({ ok: false, error: 'Enter some text to check.' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps a successful response into GrammarMatch entries', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            matches: [
              {
                offset: 5,
                length: 3,
                message: 'Did you mean "the"?',
                shortMessage: 'Typo',
                replacements: [{ value: 'the' }, { value: 'a' }],
                rule: { id: 'TYPO_RULE' },
              },
            ],
          }),
      }),
    );

    const result = await checkGrammar('this teh cat');
    expect(result).toEqual({
      ok: true,
      matches: [
        { offset: 5, length: 3, message: 'Did you mean "the"?', shortMessage: 'Typo', replacements: ['the', 'a'], ruleId: 'TYPO_RULE' },
      ],
    });
  });

  it('reports an HTTP error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const result = await checkGrammar('some text');
    expect(result).toEqual({ ok: false, error: 'LanguageTool request failed (HTTP 503).' });
  });

  it('reports a network/CORS failure as a TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const result = await checkGrammar('some text');
    expect(result).toEqual({ ok: false, error: 'Could not reach LanguageTool — this may be a network issue or a CORS block.' });
  });

  it('defaults to no matches when the response has none', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

    const result = await checkGrammar('some text');
    expect(result).toEqual({ ok: true, matches: [] });
  });
});
