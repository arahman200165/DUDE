import { Component, ElementRef, OnDestroy, signal, viewChild } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { CameraCapture } from '../../shared/components/camera-capture/camera-capture';
import { decodeQrFromImageData } from './qr-decode';

/**
 * Camera frames are decoded entirely client-side via `jsqr` and never leave
 * the browser -- see `docs/SECURITY.md`'s camera-access section.
 */
@Component({
  selector: 'app-qr-code-scanner',
  imports: [ToolShell, ErrorPanel, CopyButton, FileDrop, CameraCapture],
  templateUrl: './qr-code-scanner.html',
})
export class QrCodeScanner implements OnDestroy {
  protected readonly rejection = signal<string | null>(null);
  protected readonly result = signal<string | null>(null);
  protected readonly scanning = signal(false);

  private readonly cameraRef = viewChild<CameraCapture>('camera');
  private readonly scanCanvas = document.createElement('canvas');
  private readonly scanCtx = this.scanCanvas.getContext('2d', { willReadFrequently: true });
  private frameHandle: number | null = null;

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.result.set(null);

    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      this.rejection.set('Canvas 2D context unavailable.');
      return;
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const decoded = decodeQrFromImageData(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (decoded) this.result.set(decoded.data);
    else this.rejection.set('No QR code found in this image.');
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected onCameraStreamReady(): void {
    this.result.set(null);
    this.scanning.set(true);
    this.scanLoop();
  }

  protected onCameraStopped(): void {
    this.scanning.set(false);
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  private scanLoop = (): void => {
    if (!this.scanning()) return;

    const video = this.cameraRef()?.videoElement;
    if (video && this.scanCtx && video.videoWidth > 0) {
      this.scanCanvas.width = video.videoWidth;
      this.scanCanvas.height = video.videoHeight;
      this.scanCtx.drawImage(video, 0, 0);
      const decoded = decodeQrFromImageData(this.scanCtx.getImageData(0, 0, this.scanCanvas.width, this.scanCanvas.height));
      if (decoded) {
        this.result.set(decoded.data);
        this.cameraRef()?.stop();
        return;
      }
    }

    this.frameHandle = requestAnimationFrame(this.scanLoop);
  };

  ngOnDestroy(): void {
    this.onCameraStopped();
  }
}
