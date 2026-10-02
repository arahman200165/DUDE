import { hostCrypto } from "@dude/crypto/host";
import type { UserContentKind } from "../../shared/models/panel-definition.model.js";
import { HomePanelLink, MAX_LABEL_CHARS, validateLink } from "../home-panel/home-panel.model.js";

/**
 * User-authored Home panel content (DUDE_PRD.md Phase 30I). Like the M561 notes it replaces, this is
 * *local user-typed content*: plain text only (never markup), http(s)-only links, and shortcut
 * targets that are *references* (ids) to authoritative tools, destinations, settings sections, or
 * command-source commands — never copies of their state. Everything read from storage or a backup
 * is re-sanitized; nothing here executes anything.
 */
export const MAX_USER_TITLE_CHARS = 60;
export const MAX_TEXT_CHARS = 2000;
export const MAX_PANEL_LINKS = 10;
export const MAX_SHORTCUTS = 12;
export const MAX_REF_CHARS = 200;

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const SHORTCUT_TARGET_KINDS = ['tool', 'destination', 'settings', 'command'] as const;
export type ShortcutTargetKind = (typeof SHORTCUT_TARGET_KINDS)[number];

export interface ShortcutTarget {
  readonly id: string;
  readonly kind: ShortcutTargetKind;
  /** Tool id, shell destination id, settings section id (`general`, `tools/<toolId>`), or command id. */
  readonly ref: string;
  /** Optional user label; the resolved title is used when blank. */
  readonly label: string;
}

export interface TextContent {
  readonly kind: 'text';
  readonly title: string;
  readonly text: string;
}
export interface LinkContent {
  readonly kind: 'link';
  readonly title: string;
  readonly links: readonly HomePanelLink[];
}
export interface ShortcutContent {
  readonly kind: 'shortcut';
  readonly title: string;
  readonly targets: readonly ShortcutTarget[];
}
export type UserContent = TextContent | LinkContent | ShortcutContent;

export function emptyUserContent(kind: UserContentKind): UserContent {
  switch (kind) {
    case 'text':
      return { kind, title: '', text: '' };
    case 'link':
      return { kind, title: '', links: [] };
    case 'shortcut':
      return { kind, title: '', targets: [] };
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

function sanitizeLinks(raw: unknown, newId: () => string): HomePanelLink[] {
  const links: HomePanelLink[] = [];
  const seenUrls = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (links.length >= MAX_PANEL_LINKS) break;
    if (!isRecord(item) || typeof item['url'] !== 'string') continue;
    const checked = validateLink(typeof item['label'] === 'string' ? item['label'] : '', item['url']);
    if (!checked.ok || seenUrls.has(checked.link.url)) continue;
    const rawId = item['id'];
    const id = typeof rawId === 'string' && ID_PATTERN.test(rawId) && !seenIds.has(rawId) ? rawId : newId();
    seenUrls.add(checked.link.url);
    seenIds.add(id);
    links.push({ id, ...checked.link });
  }
  return links;
}

function sanitizeTargets(raw: unknown, newId: () => string): ShortcutTarget[] {
  const targets: ShortcutTarget[] = [];
  const seen = new Set<string>();
  const seenIds = new Set<string>();
  for (const item of Array.isArray(raw) ? raw : []) {
    if (targets.length >= MAX_SHORTCUTS) break;
    if (!isRecord(item)) continue;
    const kind = item['kind'];
    if (!(SHORTCUT_TARGET_KINDS as readonly unknown[]).includes(kind)) continue;
    const ref = typeof item['ref'] === 'string' ? item['ref'].trim() : '';
    if (ref.length === 0 || ref.length > MAX_REF_CHARS) continue;
    const key = `${kind as string}:${ref}`;
    if (seen.has(key)) continue;
    const rawId = item['id'];
    const id = typeof rawId === 'string' && ID_PATTERN.test(rawId) && !seenIds.has(rawId) ? rawId : newId();
    seen.add(key);
    seenIds.add(id);
    targets.push({ id, kind: kind as ShortcutTargetKind, ref, label: str(item['label'], MAX_LABEL_CHARS).trim() });
  }
  return targets;
}

/**
 * Defensive parse of untrusted content for a panel of the given kind. Content whose stored `kind`
 * disagrees with the panel kind is discarded (empty), so a swapped/imported record can't smuggle a
 * different shape into a renderer. Never throws.
 */
export function sanitizeUserContent(kind: UserContentKind, raw: unknown, newId: () => string = () => hostCrypto().randomUUID()): UserContent {
  if (!isRecord(raw) || raw['kind'] !== kind) return emptyUserContent(kind);
  const title = str(raw['title'], MAX_USER_TITLE_CHARS).trim();
  switch (kind) {
    case 'text':
      return { kind, title, text: str(raw['text'], MAX_TEXT_CHARS) };
    case 'link':
      return { kind, title, links: sanitizeLinks(raw['links'], newId) };
    case 'shortcut':
      return { kind, title, targets: sanitizeTargets(raw['targets'], newId) };
  }
}

export function hasUserContent(content: UserContent): boolean {
  switch (content.kind) {
    case 'text':
      return content.text.trim().length > 0 || content.title.length > 0;
    case 'link':
      return content.links.length > 0 || content.title.length > 0;
    case 'shortcut':
      return content.targets.length > 0 || content.title.length > 0;
  }
}
