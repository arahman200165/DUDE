import { HomeLayoutService } from '../../../core/home-layout/home-layout.service';
import { UserContent } from "@dude/domain/core/home-layout/user-content.model";
import { EMPTY_HOME_PANEL_CONTENT } from "@dude/domain/core/home-panel/home-panel.model";
import { HomePanelService } from '../../../core/home-panel/home-panel.service';

const TEXT_KIND = 'user-text';
const LINKS_KIND = 'user-links';

/**
 * One-way move of the Phase 30H.6 "Notes & links" content (`'__home__'` store) into the Home layout
 * store's text and link panels. It prefers an existing empty panel of the right kind (the shipped
 * default has both), adds one if the user's layout has none, and clears the legacy store only after
 * the content is safely stored — so nothing is lost if a panel can't be created. Also picks up
 * legacy `homePanel` sections imported from older backups. Idempotent.
 */
export function migrateLegacyHomePanel(legacy: HomePanelService, layout: HomeLayoutService): void {
  if (!legacy.hasContent()) return;

  const place = (kindId: string, content: UserContent): boolean => {
    const empty = layout.instancesOfKind(kindId).find((i) => !layout.contentOf(i.id));
    if (empty) {
      layout.setContent(empty.id, content);
      return !!layout.contentOf(empty.id);
    }
    return layout.appendInstance(kindId, content) !== null;
  };

  const note = legacy.note();
  const links = legacy.links();
  const noteMoved = note.trim().length === 0 || place(TEXT_KIND, { kind: 'text', title: 'Note', text: note });
  const linksMoved = links.length === 0 || place(LINKS_KIND, { kind: 'link', title: 'Links', links });
  if (noteMoved && linksMoved) legacy.importContent(EMPTY_HOME_PANEL_CONTENT);
}
