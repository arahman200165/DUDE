import {
  endOwnerRequest, filterByQuery, formatEndpoint, isListening, joinSocketsToProcesses, rowKey, type PortRow,
} from "./port-process-lookup-logic.js";
export function PortProcessLookupTool_canEnd(row: PortRow): boolean { return row.startKey !== ''; }
