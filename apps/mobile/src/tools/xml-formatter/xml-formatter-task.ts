import { processXml, type XmlFormatResult, type XmlIndent, type XmlMode } from '@dude/tool-engine/tools/xml-formatter/xml-format';
import { defineOffThreadTask } from '../../kit/off-thread';

export interface XmlTaskPayload { readonly input: string; readonly mode: XmlMode; readonly indent: XmlIndent }

/** Runs on the worklet worker runtime (fast-xml-parser is bundled into the engine module, which is re-imported there). */
export const xmlFormatTask = defineOffThreadTask((payload: XmlTaskPayload): XmlFormatResult => {
  'worklet';
  return processXml(payload.input, payload.mode, payload.indent);
});
