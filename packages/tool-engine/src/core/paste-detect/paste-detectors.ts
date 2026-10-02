/**
 * Curated Smart Paste-Detection shape registry (`DUDE_PRD.md` §21 Phase 21 Item 3).
 *
 * A hand-maintained array, not a per-tool convention file — see `AGENTS.md` in this directory for
 * why. Each detector delegates to the owning tool's existing pure-logic export wherever one already
 * exists; only JSON's "is this JSON-shaped" check and the Snowflake/hex-color length/pattern gates
 * are new, since no existing tool exports a bare predicate for those.
 *
 * The document-format detectors at the end (SVG, HTML, XML, Markdown, YAML, SQL, CSV, …) use the
 * lightweight structural sniffers in `text-format-sniffers.ts` instead of the tools' real parsers —
 * this array ships in the prefetched shell bundle, and those parsers are heavy (see that file).
 * They're scored at or below JSON's 0.8 unless the shape is unmistakable (an `<svg>` root, a
 * `FROM` Dockerfile), so a specific ID/token match always outranks "this is some document".
 */
import { PasteDetector } from "@dude/domain/shared/models/paste-detector.model";
import { decodeJwt } from "../../tools/jwt/jwt-decode.js";
import { inspectUuid } from "../../tools/uuid/uuid-tool.js";
import { decodeBase64 } from "@dude/crypto/base64-codec";
import { resolveUnit } from "../../tools/unix-timestamp/timestamp-convert.js";
import { parseUrl } from "../../tools/url-inspector/url-parts.js";
import { inspectUlid } from "../../tools/ulid-tools/ulid-logic.js";
import { inspectKsuid } from "../../tools/ksuid-tools/ksuid-logic.js";
import { parseColor } from "../../tools/color-converter/color-convert.js";
import { inspectIpAddress } from "../../tools/ip-address-inspector/ip-address-inspector-logic.js";
import {
  looksLikeCss,
  looksLikeDockerfile,
  looksLikeDotenv,
  looksLikeHtmlDocument,
  looksLikeKubernetesManifest,
  looksLikeSql,
  looksLikeStackTrace,
  looksLikeSvg,
  looksLikeXml,
  looksLikeYaml,
  markdownSignalCount,
  sniffDelimitedTable,
} from "./text-format-sniffers.js";

const HEX_COLOR_LENGTHS = new Set([3, 4, 6, 8]);
const HEX_COLOR_PATTERN = /^#?[0-9a-f]{3,8}$/i;

export const PASTE_DETECTORS: readonly PasteDetector[] = [
  {
    toolId: 'jwt',
    test: (text) => (decodeJwt(text.trim()).ok ? 0.95 : null),
  },
  {
    toolId: 'uuid',
    test: (text) => (inspectUuid(text.trim()).valid ? 0.95 : null),
  },
  {
    toolId: 'ulid-tools',
    test: (text) => (inspectUlid(text.trim()).valid ? 0.9 : null),
  },
  {
    toolId: 'ksuid-tools',
    test: (text) => (inspectKsuid(text.trim()).ok ? 0.85 : null),
  },
  {
    toolId: 'ip-address-inspector',
    test: (text) => (inspectIpAddress(text.trim()) !== null ? 0.85 : null),
  },
  {
    toolId: 'json',
    test: (text) => {
      const trimmed = text.trim();
      if (trimmed === '') return null;
      try {
        const parsed: unknown = JSON.parse(trimmed);
        return typeof parsed === 'object' && parsed !== null ? 0.8 : null;
      } catch {
        return null;
      }
    },
  },
  {
    toolId: 'url-inspector',
    // A URL never contains whitespace — without this, `parseUrl` happily reads multi-line
    // `name: value` text (YAML, stack traces) as a URL with the scheme "name:".
    test: (text) => {
      const trimmed = text.trim();
      return !/\s/.test(trimmed) && parseUrl(trimmed).ok ? 0.8 : null;
    },
  },
  {
    toolId: 'unix-timestamp',
    test: (text) => {
      const trimmed = text.trim();
      if (!/^-?\d{9,}$/.test(trimmed)) return null;
      const unit = resolveUnit(trimmed, 'auto');
      if (!unit) return null;
      if (unit === 'seconds' || unit === 'milliseconds') return 0.85;
      return unit === 'microseconds' ? 0.6 : 0.5;
    },
  },
  {
    // Any decimal integer structurally qualifies, so this is deliberately low-confidence — it
    // should only outrank `unix-timestamp` when nothing more specific matches (see AGENTS.md).
    toolId: 'snowflake-id-tools',
    test: (text) => {
      const trimmed = text.trim();
      return /^\d{15,20}$/.test(trimmed) ? 0.35 : null;
    },
  },
  {
    toolId: 'color-converter',
    test: (text) => {
      const trimmed = text.trim();
      if (!HEX_COLOR_PATTERN.test(trimmed)) return null;
      if (!HEX_COLOR_LENGTHS.has(trimmed.replace(/^#/, '').length)) return null;
      return parseColor(trimmed).ok ? 0.75 : null;
    },
  },
  {
    toolId: 'base64',
    test: (text) => {
      const trimmed = text.trim();
      if (trimmed.length < 8 || trimmed.length % 4 !== 0) return null;
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(trimmed)) return null;
      return decodeBase64(trimmed).ok ? 0.5 : null;
    },
  },
  { toolId: 'svg-viewer', test: (text) => (looksLikeSvg(text) ? 0.9 : null) },
  { toolId: 'svg-data-uri', test: (text) => (looksLikeSvg(text) ? 0.55 : null) },
  { toolId: 'html-formatter', test: (text) => (looksLikeHtmlDocument(text) ? 0.8 : null) },
  { toolId: 'html-preview', test: (text) => (looksLikeHtmlDocument(text) ? 0.6 : null) },
  {
    toolId: 'xml-formatter',
    test: (text) => (looksLikeXml(text) && !looksLikeSvg(text) && !looksLikeHtmlDocument(text) ? 0.75 : null),
  },
  { toolId: 'dockerfile-linter', test: (text) => (looksLikeDockerfile(text) ? 0.9 : null) },
  { toolId: 'k8s-manifest-validator', test: (text) => (looksLikeKubernetesManifest(text) ? 0.8 : null) },
  // `Error: message` plus indented `at …` frames is structurally YAML-ish too.
  { toolId: 'yaml-json', test: (text) => (looksLikeYaml(text) && !looksLikeStackTrace(text) ? 0.6 : null) },
  { toolId: 'sql-formatter-tool', test: (text) => (looksLikeSql(text) ? 0.75 : null) },
  { toolId: 'stack-trace-formatter', test: (text) => (looksLikeStackTrace(text) ? 0.8 : null) },
  { toolId: 'env-editor', test: (text) => (looksLikeDotenv(text) ? 0.6 : null) },
  { toolId: 'css-formatter', test: (text) => (looksLikeCss(text) ? 0.6 : null) },
  {
    // Deliberately low: plenty of prose has a comma on every line of a short paste.
    toolId: 'csv-viewer',
    test: (text) => {
      const delimiter = sniffDelimitedTable(text);
      return delimiter === null ? null : delimiter === '\t' ? 0.55 : 0.5;
    },
  },
  {
    toolId: 'markdown',
    test: (text) => {
      const signals = markdownSignalCount(text);
      return signals >= 3 ? 0.6 : signals === 2 ? 0.5 : null;
    },
  },
];
