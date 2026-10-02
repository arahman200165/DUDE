import { Component, computed, inject, signal } from '@angular/core';
import { ToolShell } from '../../shared/components/tool-shell/tool-shell';
import { ErrorPanel } from '../../shared/components/error-panel/error-panel';
import { CopyButton } from '../../shared/components/copy-button/copy-button';
import { PersistenceService } from '../../core/persistence/persistence.service';
import {
  AsymmetricKeyPair,
  EC_CURVES,
  EcCurve,
  generateAsymmetricKeyPair,
  KeyFamily,
  RSA_MODULUS_LENGTHS,
  RsaModulusLength,
} from "@dude/tool-engine/tools/asymmetric-key-generator/asymmetric-keygen-logic";

type OutputFormat = 'pem' | 'jwk';

/**
 * Deliberately does not persist the generated key pair (public or private) —
 * matches `jwt-signer`'s existing precedent for in-browser key generation.
 * Only the family/curve/modulus-length/output-format choices are
 * non-sensitive UI preferences. Generation is native `crypto.subtle` via
 * `jose` — no network, no Worker (not CPU-bound enough to block the main
 * thread meaningfully, even for RSA-4096).
 */
@Component({
  selector: 'app-asymmetric-key-generator',
  imports: [ToolShell, ErrorPanel, CopyButton],
  templateUrl: './asymmetric-key-generator.html',
})
export class AsymmetricKeyGenerator {
  private readonly persistence = inject(PersistenceService);

  protected readonly rsaModulusLengths = RSA_MODULUS_LENGTHS;
  protected readonly ecCurves = EC_CURVES;

  protected readonly family = this.persistence.signal<KeyFamily>('asymmetric-key-generator', 'family', 'local', 'rsa');
  protected readonly modulusLength = this.persistence.signal<RsaModulusLength>(
    'asymmetric-key-generator',
    'modulusLength',
    'local',
    2048,
  );
  protected readonly curve = this.persistence.signal<EcCurve>('asymmetric-key-generator', 'curve', 'local', 'P-256');
  protected readonly outputFormat = this.persistence.signal<OutputFormat>(
    'asymmetric-key-generator',
    'outputFormat',
    'local',
    'pem',
  );

  protected readonly keyPair = signal<AsymmetricKeyPair | null>(null);
  protected readonly status = signal<'idle' | 'generating'>('idle');
  protected readonly error = signal<string | null>(null);

  protected readonly publicKeyOutput = computed(() => {
    const pair = this.keyPair();
    if (!pair) return '';
    return this.outputFormat() === 'pem' ? pair.publicKeyPem : pair.publicKeyJwk;
  });

  protected readonly privateKeyOutput = computed(() => {
    const pair = this.keyPair();
    if (!pair) return '';
    return this.outputFormat() === 'pem' ? pair.privateKeyPem : pair.privateKeyJwk;
  });

  protected setFamily(family: KeyFamily): void {
    this.family.set(family);
    this.keyPair.set(null);
  }

  protected setModulusLength(event: Event): void {
    this.modulusLength.set(Number((event.target as HTMLSelectElement).value) as RsaModulusLength);
  }

  protected setCurve(event: Event): void {
    this.curve.set((event.target as HTMLSelectElement).value as EcCurve);
  }

  protected setOutputFormat(format: OutputFormat): void {
    this.outputFormat.set(format);
  }

  protected async generate(): Promise<void> {
    this.status.set('generating');
    this.error.set(null);
    try {
      const pair = await generateAsymmetricKeyPair({
        family: this.family(),
        modulusLength: this.modulusLength(),
        curve: this.curve(),
      });
      this.keyPair.set(pair);
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Key generation failed.');
    } finally {
      this.status.set('idle');
    }
  }

  protected clear(): void {
    this.keyPair.set(null);
    this.error.set(null);
  }
}
