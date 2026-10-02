import { describe, expect, it } from 'vitest';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { PasteDetector } from "@dude/domain/shared/models/paste-detector.model";
import { AMBIENT_CONFIDENCE_FLOOR, detectAmbientMatch, isEditablePasteTarget } from './ambient-paste';

function makeTool(id: string): ToolDefinition {
  return {
    id,
    title: id,
    description: '',
    category: 'developer',
    keywords: [],
    route: `/tools/${id}`,
    load: () => Promise.resolve(),
    io: { accepts: ['text'], produces: ['text'] },
  };
}

const HIGH_CONFIDENCE_DETECTOR: PasteDetector = { toolId: 'uuid', test: () => 0.95 };
const LOW_CONFIDENCE_DETECTOR: PasteDetector = { toolId: 'base64', test: () => 0.5 };
const getTool = (id: string) => (id === 'uuid' || id === 'base64' ? makeTool(id) : undefined);

describe('detectAmbientMatch', () => {
  it('returns the best match when it meets the confidence floor', () => {
    const match = detectAmbientMatch('some-uuid-shaped-text', [HIGH_CONFIDENCE_DETECTOR], getTool);
    expect(match?.toolId).toBe('uuid');
  });

  it('returns null when the only match is below the confidence floor', () => {
    const match = detectAmbientMatch('some-text', [LOW_CONFIDENCE_DETECTOR], getTool);
    expect(match).toBeNull();
  });

  it('picks the best match, not just the first, among several detectors', () => {
    const match = detectAmbientMatch('text', [LOW_CONFIDENCE_DETECTOR, HIGH_CONFIDENCE_DETECTOR], getTool);
    expect(match?.toolId).toBe('uuid');
  });

  it('is stricter than a middling score just under the floor', () => {
    const borderline: PasteDetector = { toolId: 'base64', test: () => AMBIENT_CONFIDENCE_FLOOR - 0.01 };
    expect(detectAmbientMatch('text', [borderline], getTool)).toBeNull();
  });
});

describe('isEditablePasteTarget', () => {
  it('treats an <input> as editable', () => {
    expect(isEditablePasteTarget(document.createElement('input'))).toBe(true);
  });

  it('treats a <textarea> as editable', () => {
    expect(isEditablePasteTarget(document.createElement('textarea'))).toBe(true);
  });

  it('treats a contenteditable element as editable', () => {
    // The test DOM environment doesn't compute `isContentEditable` from the `contenteditable`
    // attribute the way a real browser does, so this stubs the property directly rather than
    // relying on that computation -- it's `isEditablePasteTarget`'s own boolean-coercion behavior
    // being tested here, not the environment's editability model.
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { value: true });
    expect(isEditablePasteTarget(div)).toBe(true);
  });

  it('treats a plain, non-editable element as not editable', () => {
    expect(isEditablePasteTarget(document.createElement('div'))).toBe(false);
  });

  it('treats a null target as not editable', () => {
    expect(isEditablePasteTarget(null)).toBe(false);
  });
});
