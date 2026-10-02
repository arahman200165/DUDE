import { Component, computed, effect, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  GeneratedSshKeyPair,
  ParseSshPublicKeyResult,
  SSH_EC_CURVES,
  SSH_RSA_MODULUS_LENGTHS,
  SshEcCurve,
  SshKeyFamily,
  SshRsaModulusLength,
  generateSshKeyPair,
  md5Fingerprint,
  parseSshPublicKey,
  sha256Fingerprint,
} from "@dude/tool-engine/tools/ssh-key-tools/ssh-key-logic";

type Mode = 'generate' | 'inspect';

/**
 * Deliberately does not persist the generated private key, generated public
 * key, or pasted public key to inspect — matches `asymmetric-key-generator`'s
 * precedent. Family/curve/modulus-length choices are non-sensitive UI
 * preferences. All computation is native `crypto.subtle` (key generation,
 * SHA-256 fingerprint) plus pure JS (`js-md5`, the OpenSSH wire-format
 * encode/decode) — no network, no Worker.
 */
@Component({
  selector: 'app-ssh-key-tools',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './ssh-key-tools.html',
})
export class SshKeyTools {
  private readonly persistence = inject(PersistenceService);

  protected readonly rsaModulusLengths = SSH_RSA_MODULUS_LENGTHS;
  protected readonly ecCurves = SSH_EC_CURVES;

  protected readonly mode = this.persistence.signal<Mode>('ssh-key-tools', 'mode', 'local', 'generate');
  protected readonly family = this.persistence.signal<SshKeyFamily>('ssh-key-tools', 'family', 'local', 'ed25519');
  protected readonly modulusLength = this.persistence.signal<SshRsaModulusLength>('ssh-key-tools', 'modulusLength', 'local', 2048);
  protected readonly curve = this.persistence.signal<SshEcCurve>('ssh-key-tools', 'curve', 'local', 'P-256');
  protected readonly comment = signal('');

  protected readonly generateStatus = signal<'idle' | 'generating'>('idle');
  protected readonly generated = signal<GeneratedSshKeyPair | null>(null);
  protected readonly generateError = signal<string | null>(null);

  protected readonly inspectInput = this.persistence.signal('ssh-key-tools', 'inspectInput', 'session', '');
  protected readonly inspectResult = computed<ParseSshPublicKeyResult | null>(() =>
    this.inspectInput().trim() === '' ? null : parseSshPublicKey(this.inspectInput()),
  );

  private readonly fingerprintsSignal = signal<{ readonly sha256: string; readonly md5: string } | null>(null);
  protected readonly fingerprints = this.fingerprintsSignal.asReadonly();

  constructor() {
    effect(() => {
      const result = this.inspectResult();
      if (!result || !result.ok) {
        this.fingerprintsSignal.set(null);
        return;
      }
      const blob = result.key.blob;
      const md5 = md5Fingerprint(blob);
      sha256Fingerprint(blob).then((sha256) => this.fingerprintsSignal.set({ sha256, md5 }));
    });
  }

  protected setMode(mode: Mode): void {
    this.mode.set(mode);
  }

  protected setFamily(family: SshKeyFamily): void {
    this.family.set(family);
  }

  protected setModulusLength(event: Event): void {
    this.modulusLength.set(Number((event.target as HTMLSelectElement).value) as SshRsaModulusLength);
  }

  protected setCurve(event: Event): void {
    this.curve.set((event.target as HTMLSelectElement).value as SshEcCurve);
  }

  protected onCommentInput(event: Event): void {
    this.comment.set((event.target as HTMLInputElement).value);
  }

  protected onInspectInput(event: Event): void {
    this.inspectInput.set((event.target as HTMLTextAreaElement).value);
  }

  protected async generate(): Promise<void> {
    this.generateStatus.set('generating');
    this.generateError.set(null);
    try {
      const pair = await generateSshKeyPair({
        family: this.family(),
        modulusLength: this.modulusLength(),
        curve: this.curve(),
        comment: this.comment(),
      });
      this.generated.set(pair);
    } catch (error) {
      this.generateError.set(error instanceof Error ? error.message : 'Key generation failed.');
    } finally {
      this.generateStatus.set('idle');
    }
  }

  protected clearGenerate(): void {
    this.generated.set(null);
    this.generateError.set(null);
  }

  protected clearInspect(): void {
    this.inspectInput.set('');
  }
}
