import { Component, ElementRef, OnDestroy, output, signal, viewChild } from '@angular/core';

export type CameraState = 'idle' | 'requesting' | 'active' | 'denied' | 'unsupported' | 'error';

/**
 * Shared `getUserMedia` wrapper -- the first camera-API use anywhere in this
 * codebase (QR Code Scanner, Barcode Reader). Never requests access on its
 * own; the consumer decides when to call `start()` (an explicit user action,
 * e.g. clicking "Use webcam"), matching the same "never automatic" framing
 * `docs/SECURITY.md` already uses for network access. Exposes the raw
 * `MediaStream` via `streamReady` and the rendered `<video>` element via
 * `videoElement` so different decoders (canvas-frame-grab for jsQR,
 * `decodeFromStream` for zxing) can consume it however they need.
 */
@Component({
  selector: 'app-camera-capture',
  templateUrl: './camera-capture.html',
})
export class CameraCapture implements OnDestroy {
  readonly streamReady = output<MediaStream>();
  readonly streamStopped = output<void>();

  protected readonly state = signal<CameraState>('idle');
  protected readonly errorMessage = signal<string | null>(null);

  private readonly videoRef = viewChild<ElementRef<HTMLVideoElement>>('video');
  private activeStream: MediaStream | null = null;

  get videoElement(): HTMLVideoElement | null {
    return this.videoRef()?.nativeElement ?? null;
  }

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.state.set('unsupported');
      this.errorMessage.set('This browser does not support camera access.');
      return;
    }

    this.state.set('requesting');
    this.errorMessage.set(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.activeStream = stream;

      const video = this.videoRef()?.nativeElement;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }

      this.state.set('active');
      this.streamReady.emit(stream);
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
      this.state.set(denied ? 'denied' : 'error');
      this.errorMessage.set(denied ? "Camera access was denied." : error instanceof Error ? error.message : 'Could not access the camera.');
    }
  }

  stop(): void {
    this.activeStream?.getTracks().forEach((track) => track.stop());
    this.activeStream = null;

    const video = this.videoRef()?.nativeElement;
    if (video) video.srcObject = null;

    if (this.state() === 'active') this.state.set('idle');
    this.streamStopped.emit();
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
