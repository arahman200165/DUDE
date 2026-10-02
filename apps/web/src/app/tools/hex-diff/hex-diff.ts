import { HexDiff_hex, HexDiff_offsetHex } from "@dude/tool-engine/tools/hex-diff/hex-diff.embedded-engine";
import { Component, computed, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { FileDrop } from '../../shared/components/file-drop/file-drop';
import { bytesToHexSpaced } from "@dude/tool-engine/shared/utils/byte-codec";
import { computeByteDiff, looksLikeText } from "@dude/tool-engine/shared/utils/byte-diff";

@Component({
  selector: 'app-hex-diff',
  imports: [ToolShell, ErrorPanel, FileDrop],
  templateUrl: './hex-diff.html',
})
export class HexDiff {
  protected readonly leftName = signal<string | null>(null);
  protected readonly rightName = signal<string | null>(null);
  private readonly leftBytes = signal<Uint8Array | null>(null);
  private readonly rightBytes = signal<Uint8Array | null>(null);
  protected readonly rejection = signal<string | null>(null);

  protected readonly chunks = computed(() => {
    const left = this.leftBytes();
    const right = this.rightBytes();
    return left && right ? computeByteDiff(left, right) : null;
  });

  protected readonly summary = computed(() => {
    const chunks = this.chunks();
    if (!chunks) return null;
    const differing = chunks.filter((c) => !c.equal).length;
    return { total: chunks.length, differing };
  });

  protected readonly bothLookLikeText = computed(() => {
    const left = this.leftBytes();
    const right = this.rightBytes();
    return !!left && !!right && looksLikeText(left) && looksLikeText(right);
  });

  protected async onLeftSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.leftName.set(file.name);
    this.leftBytes.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected async onRightSelected(file: File): Promise<void> {
    this.rejection.set(null);
    this.rightName.set(file.name);
    this.rightBytes.set(new Uint8Array(await file.arrayBuffer()));
  }

  protected onRejected(message: string): void {
    this.rejection.set(message);
  }
  protected hex = HexDiff_hex;

  protected offsetHex = HexDiff_offsetHex;


  protected clear(): void {
    this.leftName.set(null);
    this.rightName.set(null);
    this.leftBytes.set(null);
    this.rightBytes.set(null);
    this.rejection.set(null);
  }
}
