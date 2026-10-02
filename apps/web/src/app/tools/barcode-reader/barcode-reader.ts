import { Component, OnDestroy, signal, viewChild } from '@angular/core';
import { BrowserMultiFormatReader } from '@zxing/library';
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

  private readonly cameraRef = viewChild<CameraCapture>('camera');
  private readonly reader = new BrowserMultiFormatReader();

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.result.set(null);

    const url = URL.createObjectURL(file);
    try {
      const decoded = await this.reader.decodeFromImageUrl(url);
      this.result.set(decoded.getText());
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
    this.result.set(null);

    const video = this.cameraRef()?.videoElement;
    if (!video) return;

    this.reader
      .decodeFromStream(stream, video, (decoded) => {
        if (decoded) {
          this.result.set(decoded.getText());
          this.reader.stopContinuousDecode();
          this.cameraRef()?.stop();
        }
      })
      .catch(() => {
        // decodeFromStream's promise settles when decoding stops; a stopContinuousDecode()-triggered
        // rejection here is expected and not an error worth surfacing.
      });
  }

  protected onCameraStopped(): void {
    this.reader.stopContinuousDecode();
  }

  ngOnDestroy(): void {
    this.reader.stopContinuousDecode();
  }
}
