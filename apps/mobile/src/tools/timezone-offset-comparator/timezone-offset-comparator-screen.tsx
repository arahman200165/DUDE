import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { ErrorBanner, InputEditor, KeyValueList, ModeSegment, ToolScreen, useToolPreferences } from '../../kit';
import { useToolInput } from '../../tools-host/use-tool-input';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Field, Label } from '../../ui/primitives';
import {
  joinZones, listZones, momentText, offsetGridRows, pairwiseRows, parseMoment, parseZones, zoneKey, zonesAtMoment, type RowsResult,
} from './timezone-offset-comparator-mobile';
import { ZonePicker } from './zone-picker';

const TOOL_ID = 'timezone-offset-comparator';
// `zones` is the Android default view (offset and wall-clock time per zone) and is kept in memory only, so the synced `mode`
// preference only ever holds the web's own values (`grid`, `pairwise`); zoneA/zoneB are the web's keys too.
const MODES = [{ id: 'zones', label: 'Zones' }, { id: 'grid', label: 'Year grid' }, { id: 'pairwise', label: 'Pairwise' }] as const;
const ENTRIES = [
  { key: 'mode', defaultValue: 'pairwise' as unknown, codec: { decode: (raw: unknown) => raw === 'grid' || raw === 'pairwise' ? raw : null } },
  { key: 'zoneA', defaultValue: 'America/New_York' as unknown, codec: { decode: (raw: unknown) => typeof raw === 'string' && raw !== '' ? raw : null } },
  { key: 'zoneB', defaultValue: 'Europe/London' as unknown, codec: { decode: (raw: unknown) => typeof raw === 'string' && raw !== '' ? raw : null } },
];

function PairwiseZone({ id, title, zone, zones, onPick }: { readonly id: string; readonly title: string; readonly zone: string; readonly zones: readonly string[]; readonly onPick: (zone: string) => void }) {
  const { theme } = useWorkbench();
  const [open, setOpen] = useState(false);
  return <View style={{ gap: theme.metrics.spaceNormal }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: theme.metrics.spaceNormal }}>
      <Label testID={`zone-${id}-value`} style={{ flex: 1, fontWeight: '700' }}>{title}: {zone}</Label>
      <Button testID={`zone-${id}-change`} title={open ? 'Close' : 'Change'} hint={`Chooses another time zone for ${title}`} onPress={() => setOpen(value => !value)} />
    </View>
    {open && <ZonePicker prefix={`zone-${id}`} label={`Search for ${title}`} zones={zones} onPick={next => { onPick(next); setOpen(false); }} />}
  </View>;
}

export default function TimezoneOffsetComparatorScreen() {
  const { theme } = useWorkbench();
  const [stored, update] = useToolInput(TOOL_ID, { zonesText: 'America/New_York, Europe/London', moment: momentText(Date.now()), year: String(new Date().getFullYear()) });
  const zonesText = typeof stored.zonesText === 'string' ? stored.zonesText : '';
  const moment = typeof stored.moment === 'string' ? stored.moment : '';
  const year = typeof stored.year === 'string' ? stored.year : '';
  const [prefs, setPref] = useToolPreferences(TOOL_ID, ENTRIES);
  const [zonesView, setZonesView] = useState(true);
  const mode = zonesView ? 'zones' : String(prefs.mode);
  const zoneA = String(prefs.zoneA);
  const zoneB = String(prefs.zoneB);
  const allZones = useMemo(() => listZones(), []);
  const selected = useMemo(() => parseZones(zonesText), [zonesText]);

  const outcome = useMemo<RowsResult>(() => {
    if (mode === 'grid') {
      const yearNumber = Number(year);
      return year.trim() === '' || !Number.isInteger(yearNumber) ? { ok: false, error: 'Enter a valid year.' } : offsetGridRows(selected, yearNumber);
    }
    const at = parseMoment(moment);
    if (!at.ok) return at;
    return mode === 'pairwise' ? pairwiseRows(zoneA, zoneB, at.ms) : zonesAtMoment(selected, at.ms);
  }, [mode, year, moment, selected, zoneA, zoneB]);

  return <ToolScreen
    input={<View style={{ gap: theme.metrics.spaceMajor }}>
      <ModeSegment modes={MODES} value={MODES.some(item => item.id === mode) ? mode : 'zones'} onChange={next => { setZonesView(next === 'zones'); if (next !== 'zones') setPref('mode', next); }} />
      {mode === 'grid'
        ? <Field testID="tool-year" label="Year" value={year} onChangeText={text => update({ year: text.replace(/[^0-9]/g, '') })} keyboardType="number-pad" />
        : <InputEditor value={moment} onChangeText={text => update({ moment: text })} label="Moment (ISO 8601, UTC unless it has an offset)" placeholder="2026-01-15T12:00"
          extraActions={<Button testID="tool-use-now" title="Use now" hint="Puts the current UTC time into the input" onPress={() => update({ moment: momentText(Date.now()) })} />} />}
      {mode === 'pairwise'
        ? <View style={{ gap: theme.metrics.spaceMajor }}>
          <PairwiseZone id="a" title="Zone A" zone={zoneA} zones={allZones} onPick={zone => setPref('zoneA', zone)} />
          <PairwiseZone id="b" title="Zone B" zone={zoneB} zones={allZones} onPick={zone => setPref('zoneB', zone)} />
        </View>
        : <View style={{ gap: theme.metrics.spaceNormal }}>
          <Label accessibilityRole="header" style={{ fontWeight: '700' }}>Time zones</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
            {selected.map(zone => <Button key={zone} testID={`zone-remove-${zoneKey(zone)}`} title={`${zone} ✕`} accessibilityLabel={`Remove ${zone}`} hint="Removes this time zone" onPress={() => update({ zonesText: joinZones(selected.filter(item => item !== zone)) })} />)}
            {selected.length === 0 && <Label muted>No time zones selected.</Label>}
          </View>
          <ZonePicker prefix="zone-add" label="Add a time zone" zones={allZones} exclude={selected} onPick={zone => update({ zonesText: joinZones([...selected, zone]) })} />
        </View>}
    </View>}
    output={outcome.ok ? <KeyValueList rows={outcome.rows} emptyText="Nothing to show." /> : <ErrorBanner message={outcome.error} />}
  />;
}
