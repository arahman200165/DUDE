import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Field, Label } from '../../ui/primitives';
import { filterZones, isKnownZone, zoneKey } from './timezone-offset-comparator-mobile';

/**
 * Searchable zone chooser. Shows the first matches of `zones` for the query (a typed id the runtime knows is offered too).
 * testIDs: `<prefix>-search`, `<prefix>-option-<zone key>`.
 */
export function ZonePicker({ zones, onPick, prefix, label, exclude = [] }: {
  readonly zones: readonly string[]; readonly onPick: (zone: string) => void; readonly prefix: string; readonly label: string; readonly exclude?: readonly string[];
}) {
  const { theme } = useWorkbench();
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    const matches = filterZones(zones, query).filter(zone => !exclude.includes(zone));
    const typed = query.trim();
    return typed !== '' && !zones.includes(typed) && !exclude.includes(typed) && isKnownZone(typed) ? [typed, ...matches] : matches;
  }, [zones, query, exclude]);
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <Field testID={`${prefix}-search`} label={label} value={query} onChangeText={setQuery} placeholder="Search, e.g. tokyo or Asia/Tokyo" autoCapitalize="none" autoCorrect={false} spellCheck={false} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      {results.map(zone => <Button key={zone} testID={`${prefix}-option-${zoneKey(zone)}`} title={zone} hint="Selects this time zone" onPress={() => { onPick(zone); setQuery(''); }} />)}
      {results.length === 0 && <Label muted>No matching time zone.</Label>}
    </View>
  </View>;
}
