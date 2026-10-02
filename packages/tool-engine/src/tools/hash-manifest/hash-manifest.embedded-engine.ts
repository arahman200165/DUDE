import { formatBsd, formatCsv, formatGnu, formatJson, MERKLE_DESCRIPTION, parseManifest, type ManifestEntry } from "../../shared/fs/manifest-format.js";
export function HashManifestTool_trackEntry(_index: number, entry: ManifestEntry): string { return entry.path; }
