import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { comparePixelData, RasterImage } from "@dude/tool-engine/tools/advanced-diff/image-pixel-diff";
import { AdvancedDiffImagePayload } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-image-payload";
import { AdvancedDiffImageResult } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-image-result";

/**
 * Decoding and re-encoding happen here, inside the worker (createImageBitmap/OffscreenCanvas are
 * available in a dedicated Worker in evergreen browsers) -- the pure pixel-comparison logic itself
 * lives in image-pixel-diff.ts, which is unit-testable without a canvas; this file cannot be, and
 * must be verified manually in a real browser.
 */
async function decodeToRasterImage(buffer: ArrayBuffer): Promise<RasterImage> {
  const bitmap = await createImageBitmap(new Blob([buffer]));
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not create a 2D rendering context.');
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: imageData.data, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function encodeDiffPng(diff: Uint8ClampedArray, width: number, height: number): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not create a 2D rendering context.');
  context.putImageData(new ImageData(diff, width, height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

export async function handleMessage({ data }: MessageEvent<WorkerRequestMessage<AdvancedDiffImagePayload>>): Promise<void> {
  const { id, payload } = data;

  try {
    const [left, right] = await Promise.all([decodeToRasterImage(payload.left), decodeToRasterImage(payload.right)]);
    const outcome = comparePixelData(left, right, { threshold: payload.threshold });

    if (!outcome.ok) {
      const result: AdvancedDiffImageResult = { ok: false, error: outcome.error };
      postMessage(resultMessage(id, result));
      return;
    }

    const diffPng = await encodeDiffPng(outcome.result.diff, outcome.result.width, outcome.result.height);
    const result: AdvancedDiffImageResult = {
      ok: true,
      diffPng,
      width: outcome.result.width,
      height: outcome.result.height,
      diffPixelCount: outcome.result.diffPixelCount,
      totalPixels: outcome.result.totalPixels,
      diffPercentage: outcome.result.diffPercentage,
    };
    postMessage(resultMessage(id, result), [diffPng]);
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
