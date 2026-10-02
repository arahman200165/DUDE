import { generalCategoryOf } from "./unicode-general-category.js";

describe('generalCategoryOf', () => {
  it('categorizes an uppercase letter', () => {
    expect(generalCategoryOf('A')).toEqual({ abbreviation: 'Lu', label: 'Uppercase Letter' });
  });

  it('categorizes a lowercase letter', () => {
    expect(generalCategoryOf('a')).toEqual({ abbreviation: 'Ll', label: 'Lowercase Letter' });
  });

  it('categorizes a decimal digit', () => {
    expect(generalCategoryOf('7')).toEqual({ abbreviation: 'Nd', label: 'Decimal Number' });
  });

  it('categorizes a space separator', () => {
    expect(generalCategoryOf(' ')).toEqual({ abbreviation: 'Zs', label: 'Space Separator' });
  });

  it('categorizes a control character', () => {
    expect(generalCategoryOf('\u0000')).toEqual({ abbreviation: 'Cc', label: 'Control' });
  });

  it('categorizes other punctuation', () => {
    expect(generalCategoryOf('!')).toEqual({ abbreviation: 'Po', label: 'Other Punctuation' });
  });

  it('categorizes a math symbol', () => {
    expect(generalCategoryOf('+')).toEqual({ abbreviation: 'Sm', label: 'Math Symbol' });
  });

  it('categorizes a supplementary-plane character (emoji)', () => {
    const [emoji] = Array.from('😀');
    expect(generalCategoryOf(emoji).abbreviation).toBe('So');
  });
});
