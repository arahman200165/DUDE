import { convertYaml, type JsonIndent, type YamlDirection } from '@dude/tool-engine/tools/yaml-json/yaml-convert';
import { defineOffThreadTask } from '../../kit/off-thread';

/** Runs on the worker runtime (js-yaml is imported by the engine module and bundled for the worker). */
export const convertTask = defineOffThreadTask((payload: { input: string; direction: YamlDirection; indent: JsonIndent }) => {
  'worklet';
  return convertYaml(payload.input, payload.direction, payload.indent);
});
