import { buildTree, nameOf, normalizeSelection, parentPath, reportToCsv, squarify, treemapItems, visibleRows, type SizeSort, type SizeRow } from "./folder-size-logic.js";
export function FolderSizeAnalyzerTool_trackRow(_index: number, row: SizeRow): string { return row.node.path; }
export function FolderSizeAnalyzerTool_percent(share: number): string { return `${Math.max(0.5, Math.round(share * 1000) / 10)}%`; }
export function FolderSizeAnalyzerTool_ageDate(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 10); }
