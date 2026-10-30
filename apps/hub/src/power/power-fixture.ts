/** Spec fixtures for the power policy (never imported by production code). */
/** Real `powercfg /query SCHEME_CURRENT SUB_SLEEP <setting>` output, English and German Windows (the labels differ, the GUIDs and the index lines do not). */
export const QUERY_EN = (guid: string, name: string, ac: string, dc: string): string => `Power Scheme GUID: 381b4222-f694-41f0-9685-ff5bb260df2e  (Balanced)
  GUID Alias: SCHEME_BALANCED
  Subgroup GUID: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Sleep)
    GUID Alias: SUB_SLEEP
    Power Setting GUID: ${guid}  (${name})
      Minimum Possible Setting: 0x00000000
      Maximum Possible Setting: 0xffffffff
      Possible Settings increment: 0x00000001
      Possible Settings units: Seconds
    Current AC Power Setting Index: 0x${ac}
    Current DC Power Setting Index: 0x${dc}

`;
export const QUERY_DE = (guid: string, name: string, ac: string, dc: string): string => `GUID des Energieschemas: 381b4222-f694-41f0-9685-ff5bb260df2e  (Ausbalanciert)
  GUID-Alias: SCHEME_BALANCED
  GUID der Untergruppe: 238c9fa8-0aad-41ed-83f4-97be242c8f20  (Energie sparen)
    GUID-Alias: SUB_SLEEP
    GUID der Energieeinstellung: ${guid}  (${name})
      Minimal moegliche Einstellung: 0x00000000
      Maximal moegliche Einstellung: 0xffffffff
      Moegliche Einstellungen, Schritte: 0x00000001
      Moegliche Einstellungen, Einheiten: Sekunden
    Aktueller Index der Netzstromeinstellung: 0x${ac}
    Aktueller Index der Akkustromeinstellung: 0x${dc}
`;
export const AVAILABLE_EN = `The following sleep states are available on this system:
    Standby (S3)
    Hibernate
    Hybrid Sleep
    Fast Startup

The following sleep states are not available on this system:
    Standby (S1)
        The system firmware does not support this standby state.

    Standby (S2)
        The system firmware does not support this standby state.

    Standby (S0 Low Power Idle)
        The system firmware does not support this standby state.
`;
export const AVAILABLE_MODERN = `The following sleep states are available on this system:
    Standby (S0 Low Power Idle) Network Connected
    Hibernate
    Fast Startup

The following sleep states are not available on this system:
    Standby (S1)
        The system firmware does not support this standby state.
`;
