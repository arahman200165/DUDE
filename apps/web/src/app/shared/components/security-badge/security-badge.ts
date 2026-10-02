import { Component, computed, input } from '@angular/core';
import { PersistencePolicy } from "@dude/shared-types/shared/models/persistence-policy.model";
import { ToolDefinition } from '../../models/tool-definition.model';

const PERSISTENCE_LABELS: Record<PersistencePolicy, string> = {
  none: 'Local processing · No persistence',
  session: 'Local processing · Session only',
  local: 'Local processing · Saved locally',
  'user-choice': 'Local processing · Your choice',
  'secure-local': 'Local processing · Saved to OS keychain',
};

@Component({
  selector: 'app-security-badge',
  templateUrl: './security-badge.html',
})
export class SecurityBadge {
  readonly definition = input<ToolDefinition | undefined>(undefined);

  protected readonly label = computed(() => {
    const def = this.definition();
    if (!def) {
      return '';
    }

    const persistenceLabel = PERSISTENCE_LABELS[def.persistence?.input ?? 'session'];
    const networkSuffix = def.network?.required ? ` · Network: ${def.network.detail ?? 'required'}` : '';

    return `${persistenceLabel}${networkSuffix}`;
  });
}
