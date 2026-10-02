import esm_exifr from 'exifr';
const { parse } = esm_exifr;

import { PipelineStep, PipelineStepResult, PipelineValue } from "@dude/contracts/shared/models/pipeline-step.model";
import { formatExifTags, formatGps } from "./exif-format.js";

/**
 * Pipeline-step adapter for the EXIF Viewer / Cleaner tool. Only the "view" mode is wired up
 * here — `exifr`'s `parse()` is a pure binary parser with no DOM dependency (it runs the same
 * way in Node/jsdom as a real browser), unlike the "clean" mode, which re-encodes the image
 * through `createImageBitmap`/`<canvas>` and is out of scope for the same reason as this
 * migration's other canvas-dependent image tools.
 */
export const pipelineStep: PipelineStep = {
  accepts: ['file'],
  produces: ['table'],
  async run(input: PipelineValue): Promise<PipelineStepResult> {
    if (input.type !== 'file') {
      return { ok: false, error: { message: 'EXIF Viewer expects file input.', kind: 'invalid-input' } };
    }

    let bytes: Uint8Array;
    try {
      const binary = atob(input.value.base64.trim());
      bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    } catch {
      return { ok: false, error: { message: 'File content is not valid Base64.', kind: 'invalid-input' } };
    }

    try {
      const tags = await parse(bytes, { gps: true });
      const entries = formatExifTags(tags as Record<string, unknown> | undefined);
      const gps = formatGps(tags?.latitude !== undefined ? { latitude: tags.latitude, longitude: tags.longitude } : null);

      const rows: (readonly unknown[])[] = entries.map((entry) => [entry.key, entry.value]);
      if (gps) rows.push(['gps', gps]);

      if (rows.length === 0) {
        return { ok: false, error: { message: 'No EXIF data found in this file.', kind: 'invalid-input' } };
      }

      return { ok: true, output: { type: 'table', value: { columns: ['key', 'value'], rows } } };
    } catch (error) {
      return { ok: false, error: { message: error instanceof Error ? error.message : "Couldn't parse EXIF data from this file.", kind: 'execution-error' } };
    }
  },
};
