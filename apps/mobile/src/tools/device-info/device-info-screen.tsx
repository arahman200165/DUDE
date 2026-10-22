import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { formatDeviceReportJson, formatDeviceReportText, type DeviceReport } from '@dude/tool-engine/tools/device-info/device-report';
import { announce, hapticSuccess, KeyValueList, ResultCard, shareText, ToolScreen, writeClipboard } from '../../kit';
import { useWorkbench } from '../../state/workbench-provider';
import { Button, Label } from '../../ui/primitives';
import { collectAndroidReport } from './device-info-collector';
import { reportSections } from './device-info-mobile';

/** Read-only, nothing persisted: facts are collected on open and on Refresh. */
export default function DeviceInfoScreen() {
  const { theme } = useWorkbench();
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const next = await collectAndroidReport();
      if (alive.current) setReport(next);
    } catch {
      if (alive.current) setError('Device facts could not be read.');
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const sections = useMemo(() => report ? reportSections(report) : [], [report]);
  const copy = async (text: string, what: string) => {
    if (!await writeClipboard(text)) { announce('Copy failed'); return; }
    void hapticSuccess(); announce(`Copied ${what}`);
  };
  const share = async () => {
    if (!report) return;
    try { await shareText(formatDeviceReportText(report), 'DUDE device report'); } catch { announce('Share failed'); }
  };

  return <ToolScreen
    options={<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.metrics.spaceNormal }}>
      <Button testID="device-info-refresh" title={busy ? 'Refreshing…' : 'Refresh'} hint="Reads the device facts again" disabled={busy} onPress={() => { void refresh(); }} />
      <Button testID="device-info-copy-text" title="Copy all" hint="Copies the report as text" disabled={!report} onPress={() => { if (report) void copy(formatDeviceReportText(report), 'report'); }} />
      <Button testID="device-info-copy-json" title="Copy JSON" hint="Copies the report as JSON" disabled={!report} onPress={() => { if (report) void copy(formatDeviceReportJson(report), 'JSON report'); }} />
      <Button testID="device-info-share" title="Share" hint="Shares the report as text" disabled={!report} onPress={() => { void share(); }} />
    </View>}
    output={<View style={{ gap: theme.metrics.spaceMajor }}>
      {error && <Label testID="tool-error" accessibilityRole="alert" style={{ color: theme.status.error }}>! {error}</Label>}
      <Label muted>No device name, serial number, Android ID, IP address, MAC address or Wi-Fi name is read. Nothing leaves the device unless you copy or share it.</Label>
      {sections.map(section => <ResultCard key={section.group} title={section.title}><KeyValueList rows={section.rows} /></ResultCard>)}
    </View>} />;
}
