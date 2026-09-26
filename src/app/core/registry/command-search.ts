import { CommandKind, PaletteCommand } from '../../shared/models/command-source.model';
import { CATEGORY_METADATA } from '../../shared/models/tool-category.model';

/** Fixed tie breaker across command kinds; each source keeps its own order. */
export const COMMAND_KIND_ORDER: readonly CommandKind[] = [
  'tool', 'pipeline', 'workspace', 'project', 'native', 'recent', 'preference',
];

export const COMMAND_KIND_LABEL: Record<CommandKind, string> = {
  tool: 'Tools',
  pipeline: 'Pipelines',
  workspace: 'Workspaces',
  project: 'Projects',
  native: 'Desktop actions',
  recent: 'Recent',
  preference: 'Preferences',
};

const enum MatchRank {
  ExactTitle = 0,
  TitlePrefix = 1,
  Substring = 2,
  Keyword = 3,
  Category = 4,
  None = 5,
}

function rankOf(command: PaletteCommand, query: string): MatchRank {
  const title = command.title.toLowerCase();
  if (title === query) return MatchRank.ExactTitle;
  if (title.startsWith(query)) return MatchRank.TitlePrefix;
  if (title.includes(query) || command.description?.toLowerCase().includes(query)) return MatchRank.Substring;
  if (command.keywords?.some((keyword) => keyword.toLowerCase().includes(query))) return MatchRank.Keyword;
  if (command.category && CATEGORY_METADATA[command.category].label.toLowerCase().includes(query)) {
    return MatchRank.Category;
  }
  if (COMMAND_KIND_LABEL[command.kind].toLowerCase().includes(query)) return MatchRank.Category;
  return MatchRank.None;
}

/** Tiered substring ranking, parallel to tool-search.ts, without changing Deck search behavior. */
export function searchCommands(commands: readonly PaletteCommand[], query: string): PaletteCommand[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [...commands];

  return commands
    .map((command, index) => ({ command, index, rank: rankOf(command, trimmed) }))
    .filter(({ rank }) => rank !== MatchRank.None)
    .sort((a, b) =>
      a.rank - b.rank ||
      COMMAND_KIND_ORDER.indexOf(a.command.kind) - COMMAND_KIND_ORDER.indexOf(b.command.kind) ||
      a.index - b.index,
    )
    .map(({ command }) => command);
}
