import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable } from '@angular/core';
import type { PickedSavePath, SavePathRequest } from "@dude/contracts/fs/fs-types";
import type { NativeStat } from "@dude/contracts/shared/models/platform-bridge.model";

/**
 * Thin wrapper around `window.dude.fs` (Phase 8 Stage 2) for the desktop-only
 * native folder-picker/read path in Directory Diff and Git Repo Browser.
 * Lives in `core/platform/` rather than either tool folder because both
 * tools consume it and neither owns it (`core/AGENTS.md`: no file in `core/`
 * knows a specific tool). Every method throws on an `{ ok: false }` result
 * (with `.code` set when the main process provided one) so callers use
 * ordinary try/catch instead of threading a result union through every call
 * site.
 */
@Injectable({ providedIn: 'root' })
export class NativeFsService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private get bridge() {
    const fs = this.platformBridgePort.get()?.fs;
    if (!fs) throw new Error('Native file access is only available in the desktop app.');
    return fs;
  }

  /** `defaultPath` pre-navigates the picker (a typed path is only granted once the user confirms it there). */
  async pickDirectory(defaultPath?: string): Promise<{ canceled: true } | { canceled: false; rootPath: string; rootName: string }> {
    return defaultPath ? this.bridge.pickDirectory(defaultPath) : this.bridge.pickDirectory();
  }

  /** Grants one file (Phase 29: Large-File Inspector, File Split & Join). */
  async pickFile(defaultPath?: string): Promise<{ canceled: true } | { canceled: false; path: string; name: string; size: number }> {
    return this.bridge.pickFile(defaultPath);
  }

  /** Native save dialog. The chosen file becomes a single-use write grant; nothing else is granted. */
  async pickSavePath(request?: SavePathRequest): Promise<PickedSavePath> {
    return this.bridge.pickSavePath(request);
  }

  /** Ranged read (≤ 1 MB per call) of a granted file or a file inside a granted root. */
  async readRange(rootPath: string, relativePath: string, offset: number, length: number): Promise<{ data: ArrayBuffer; size: number }> {
    const result = await this.bridge.readRange(rootPath, relativePath, offset, length);
    if (!result.ok) throw this.toError(result.error);
    return { data: result.data, size: result.size };
  }

  async walk(rootPath: string): Promise<readonly { readonly path: string; readonly size: number }[]> {
    const result = await this.bridge.walk(rootPath);
    if (!result.ok) throw this.toError(result.error);
    return result.entries;
  }

  async readFile(rootPath: string, relativePath: string): Promise<ArrayBuffer> {
    const result = await this.bridge.readFile(rootPath, relativePath);
    if (!result.ok) throw this.toError(result.error);
    return result.data;
  }

  async readdir(rootPath: string, relativePath: string): Promise<readonly string[]> {
    const result = await this.bridge.readdir(rootPath, relativePath);
    if (!result.ok) throw this.toError(result.error);
    return result.names;
  }

  async stat(rootPath: string, relativePath: string, followSymlink: boolean): Promise<NativeStat> {
    const result = await this.bridge.stat(rootPath, relativePath, followSymlink);
    if (!result.ok) throw this.toError(result.error);
    return result.stat;
  }

  private toError(error: { readonly code: string; readonly message: string }): Error {
    const err = new Error(error.message) as Error & { code: string };
    err.code = error.code;
    return err;
  }
}
