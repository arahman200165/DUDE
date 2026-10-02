import type { EventChannel, EventChannelsResult, EventLevel, EventQueryFileParams, EventQueryParams, EventQueryResult, EventRecord } from "@dude/contracts/system/system-types";
export function EventLogViewerTool_keyOf(e: EventRecord): string { return `${e.channel}#${e.recordId}`; }
export function EventLogViewerTool_message(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }
