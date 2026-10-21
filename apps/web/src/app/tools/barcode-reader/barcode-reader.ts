import { Component, OnDestroy, computed, signal, viewChild } from '@angular/core';
import { BarcodeFormat, BrowserMultiFormatReader, type Result } from '@zxing/library';
import { interpretBarcode } from "@dude/tool-engine/tools/barcode-reader/barcode-result";
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { CameraCapture } from '../../shared/components/camera-capture/camera-capture';

/**
 * Camera frames are decoded entirely client-side via `@zxing/library` and
 * never leave the browser -- see `docs/SECURITY.md`'s camera-access section.
 * Reuses the shared `CameraCapture` primitive built for the QR Code Scanner.
 */
@Component({
  selector: 'app-barcode-reader',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop, CameraCapture],
  templateUrl: './barcode-reader.html',
})
export class BarcodeReader implements OnDestroy {
  protected readonly rejection = signal<string | null>(null);
  protected readonly result = signal<string | null>(null);
  private readonly formatName = signal<string | null>(null);
  protected readonly summary = computed(() => {
    const data = this.result();
    if (data === null) return null;
    const interpreted = interpretBarcode(data, this.formatName());
    const parts = [interpreted.label];
    if (interpreted.checkDigit) parts.push(interpreted.checkDigit.valid ? 'check digit valid' : `check digit invalid (expected ${interpreted.checkDigit.expected})`);
    return parts.join(' - ');
  });

  private readonly cameraRef = viewChild<CameraCapture>('camera');
  private readonly reader = new BrowserMultiFormatReader();

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.setResult(null);

    const url = URL.createObjectURL(file);
    try {
      const decoded = await this.reader.decodeFromImageUrl(url);
      this.setResult(decoded);
    } catch {
      this.rejection.set('No barcode found in this image.');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onCameraStreamReady(stream: MediaStream): void {
    this.rejection.set(null);
    this.setResult(null);

    const video = this.cameraRef()?.videoElement;
    if (!video) return;

    this.reader
      .decodeFromStream(stream, video, (decoded) => {
        if (decoded) {
          this.setResult(decoded);
          this.reader.stopContinuousDecode();
          this.cameraRef()?.stop();
        }
      })
      .catch(() => {
        // decodeFromStream's promise settles when decoding stops; a stopContinuousDecode()-triggered
        // rejection here is expected and not an error worth surfacing.
      });
  }

  private setResult(decoded: Result | null): void {
    this.formatName.set(decoded ? BarcodeFormat[decoded.getBarcodeFormat()] : null);
    this.result.set(decoded ? decoded.getText() : null);
  }

  protected onCameraStopped(): void {
    this.reader.stopContinuousDecode();
  }

  ngOnDestroy(): void {
    this.reader.stopContinuousDecode();
  }
}
