import { useWorkbench } from '../../src/state/workbench-provider';
import { Screen, Section } from '../../src/ui/primitives';
import { FavoriteList } from '../../src/ui/favorite-list';

export default function FavoritesScreen() {
  const { snapshot } = useWorkbench();
  return <Screen><Section title="Pinned tools and pipelines"><FavoriteList items={[...snapshot.favorites].sort((a, b) => a.order - b.order)} /></Section></Screen>;
}
