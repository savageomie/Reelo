import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { tmdbImage, type ImageSize } from '@/lib/tmdb';
import { Text } from './ui/Text';

interface PosterProps {
  posterPath: string | null | undefined;
  title: string;
  width?: number;
  size?: ImageSize;
  rounded?: number;
}

/** Poster image with a graceful title fallback when TMDB has no poster (or it's not cached yet). */
export function Poster({ posterPath, title, width = 104, size = 'w342', rounded = 10 }: PosterProps) {
  const uri = tmdbImage(posterPath, size);
  const height = Math.round(width * 1.5);
  return (
    <View
      style={{ width, height, borderRadius: rounded, overflow: 'hidden' }}
      className="border border-line bg-surface2 dark:border-line-dark dark:bg-surface2-dark"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', height: '100%' }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View className="flex-1 items-center justify-center p-2">
          <Text variant="caption" className="text-center" numberOfLines={4}>
            {title}
          </Text>
        </View>
      )}
    </View>
  );
}

interface PosterCardProps extends PosterProps {
  tmdbId: number;
  subtitle?: string;
  showTitle?: boolean;
  onPress?: () => void;
  badge?: React.ReactNode;
}

export function PosterCard({ tmdbId, title, subtitle, showTitle, onPress, badge, width = 104, ...rest }: PosterCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      onPress={onPress ?? (() => router.push(`/film/${tmdbId}`))}
      className="active:opacity-80"
      style={{ width }}
    >
      <View>
        <Poster title={title} width={width} {...rest} />
        {badge ? <View className="absolute bottom-1 right-1">{badge}</View> : null}
      </View>
      {showTitle ? (
        <View className="mt-1.5">
          <Text className="text-sm" numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text variant="caption" className="text-xs" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
