import { FlashList } from '@shopify/flash-list';
import { View } from 'react-native';

import { PosterCard } from './PosterCard';
import { SkeletonPosterRow } from './ui/Skeleton';
import { Text } from './ui/Text';

export interface PosterRowItem {
  tmdb_id: number;
  title: string;
  year?: number | null;
  poster_path: string | null;
  subtitle?: string;
}

interface PosterRowProps {
  items: PosterRowItem[] | undefined;
  loading?: boolean;
  error?: boolean;
  emptyText?: string;
  width?: number;
  showTitles?: boolean;
}

/** Horizontal carousel of posters with skeleton/empty/error states. */
export function PosterRow({ items, loading, error, emptyText = 'Nothing here yet', width = 104, showTitles }: PosterRowProps) {
  if (loading) return <SkeletonPosterRow />;
  if (error)
    return (
      <Text variant="caption" className="px-4">
        Couldn’t load this row.
      </Text>
    );
  if (!items || items.length === 0)
    return (
      <Text variant="caption" className="px-4">
        {emptyText}
      </Text>
    );
  return (
    <View style={{ height: Math.round(width * 1.5) + (showTitles ? 44 : 0) }}>
      <FlashList
        horizontal
        data={items}
        keyExtractor={(f) => String(f.tmdb_id)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        renderItem={({ item }) => (
          <PosterCard
            tmdbId={item.tmdb_id}
            title={item.title}
            posterPath={item.poster_path}
            width={width}
            showTitle={showTitles}
            subtitle={item.subtitle ?? (item.year ? String(item.year) : undefined)}
          />
        )}
      />
    </View>
  );
}
