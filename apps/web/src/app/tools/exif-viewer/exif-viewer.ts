import { Component, inject, signal } from '@angular/core';
import { parse } from 'exifr';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { PersistenceService } from '../../core/persistence/persistence.service';
import { downloadFile } from '../../shared/utils/download-file';
import { ExifEntry, formatExifTags, formatGps } from "@dude/tool-engine/tools/exif-viewer/exif-format";

export type ExifMode = 'view' | 'clean';

@Component({
  selector: 'app-exif-viewer',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './exif-viewer.html',
})
export class ExifViewer {
  private readonly persistence = inject(PersistenceService);

  protected readonly mode = this.persistence.signal<ExifMode>('exif-viewer', 'mode', 'local', 'view');

  protected readonly loading = signal(false);
  protected readonly rejection = signal<string | null>(null);
  protected readonly entries = signal<readonly ExifEntry[]>([]);
  protected readonly gpsText = signal<string | null>(null);
  protected readonly fileName = signal<string | null>(null);
  protected readonly cleanedUrl = signal<string | null>(null);
  protected readonly cleanedFilename = signal<string | null>(null);

  protected setMode(mode: ExifMode): void {
    this.mode.set(mode);
    this.clear();
  }

  protected async onFileSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.entries.set([]);
    this.gpsText.set(null);
    this.fileName.set(file.name);
    this.loading.set(true);

    try {
      if (this.mode() === 'view') {
        const tags = await parse(file, { gps: true });
        this.entries.set(formatExifTags(tags as Record<string, unknown> | undefined));
        this.gpsText.set(formatGps(tags?.latitude !== undefined ? { latitude: tags.latitude, longitude: tags.longitude } : null));
        if (this.entries().length === 0 && !this.gpsText()) this.rejection.set('No EXIF data found in this file.');
      } else {
        await this.cleanFile(file);
      }
    } catch {
      this.rejection.set(this.mode() === 'view' ? "Couldn't parse EXIF data from this file." : "Couldn't process this image.");
    } finally {
      this.loading.set(false);
    }
  }

  private async cleanFile(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const outputMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, outputMime, 0.92));
    if (!blob) throw new Error('Failed to re-encode image.');

    const previousUrl = this.cleanedUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);

    this.cleanedUrl.set(URL.createObjectURL(blob));
    this.cleanedFilename.set(file.name.replace(/\.\w+$/, '') + (outputMime === 'image/png' ? '-cleaned.png' : '-cleaned.jpg'));
  }

  protected download(): void {
    const url = this.cleanedUrl();
    const filename = this.cleanedFilename();
    if (!url || !filename) return;
    fetch(url)
      .then((response) => response.blob())
      .then((blob) => blob.arrayBuffer())
      .then((buffer) => downloadFile(new Uint8Array(buffer), filename));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }

  protected clear(): void {
    const previousUrl = this.cleanedUrl();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    this.entries.set([]);
    this.gpsText.set(null);
    this.fileName.set(null);
    this.cleanedUrl.set(null);
    this.cleanedFilename.set(null);
    this.rejection.set(null);
  }
}
