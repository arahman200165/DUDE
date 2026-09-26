import { TOOL_DEFINITIONS } from './tool-definitions';

describe('desktop Explorer destinations', () => {
  it('has unique, valid file extensions with a declared input key', () => {
    const destinations = TOOL_DEFINITIONS.flatMap((tool) =>
      (tool.desktopOpen?.extensions ?? []).map((extension) => ({ extension, tool })),
    );
    expect(destinations.length).toBeGreaterThan(0);
    expect(new Set(destinations.map((item) => item.extension)).size).toBe(destinations.length);
    for (const { extension, tool } of destinations) {
      expect(extension).toMatch(/^\.[a-z0-9]+$/);
      expect(tool.desktopOpen?.inputKey).toBeTruthy();
    }
  });

  it('has exactly one folder destination', () => {
    expect(TOOL_DEFINITIONS.filter((tool) => tool.desktopOpen?.directory)).toHaveLength(1);
  });
});
