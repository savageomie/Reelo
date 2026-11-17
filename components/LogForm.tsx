import DateTimePicker from '@react-native-community/datetimepicker';
import { Calendar, Heart, Repeat } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Pressable, Switch, View } from 'react-native';

import { todayISO, formatDate } from '@/features/diary/grouping';
import { LIMITS, normaliseTags, validateReview } from '@/lib/validation';
import { useTheme } from '@/theme';
import { RatingStars } from './RatingStars';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { Input } from './ui/Input';
import { Text } from './ui/Text';

export interface LogFormValues {
  watched_on: string;
  rating: number | null;
  review: string;
  spoiler: boolean;
  tags: string[];
  is_rewatch: boolean;
  liked: boolean;
}

interface LogFormProps {
  initial?: Partial<LogFormValues>;
  onSubmit: (values: LogFormValues) => void;
  submitting?: boolean;
  submitLabel?: string;
  alreadyWatched?: boolean;
}

function shiftDays(iso: string, days: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return todayISO(d);
}

/** The diary entry form: date, half-star rating, like, rewatch, review, spoiler flag, tags. */
export function LogForm({ initial, onSubmit, submitting, submitLabel = 'Save', alreadyWatched }: LogFormProps) {
  const { colors } = useTheme();
  const today = todayISO();
  const [watchedOn, setWatchedOn] = useState(initial?.watched_on ?? today);
  const [rating, setRating] = useState<number | null>(initial?.rating ?? null);
  const [liked, setLiked] = useState(initial?.liked ?? false);
  const [rewatch, setRewatch] = useState(initial?.is_rewatch ?? !!alreadyWatched);
  const [review, setReview] = useState(initial?.review ?? '');
  const [spoiler, setSpoiler] = useState(initial?.spoiler ?? false);
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const v = validateReview(review);
    if (!v.ok) return setError(v.error);
    if (watchedOn > today) return setError("You can't log a film in the future");
    setError(null);
    onSubmit({
      watched_on: watchedOn,
      rating,
      review: review.trim(),
      spoiler: spoiler && review.trim().length > 0,
      tags: normaliseTags(tags),
      is_rewatch: rewatch,
      liked,
    });
  };

  return (
    <View className="gap-5">
      <View className="gap-2">
        <Text variant="label">Watched on</Text>
        <View className="flex-row flex-wrap items-center gap-2">
          <Chip label="Today" selected={watchedOn === today} onPress={() => setWatchedOn(today)} />
          <Chip label="Yesterday" selected={watchedOn === shiftDays(today, -1)} onPress={() => setWatchedOn(shiftDays(today, -1))} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Pick date, currently ${formatDate(watchedOn)}`}
            onPress={() => setShowPicker(true)}
            className="min-h-[36px] flex-row items-center gap-2 rounded-full border border-line px-4 dark:border-line-dark"
          >
            <Calendar size={16} color={colors.text} />
            <Text className="text-sm">{formatDate(watchedOn)}</Text>
          </Pressable>
        </View>
        {showPicker ? (
          <DateTimePicker
            value={new Date(`${watchedOn}T12:00:00`)}
            mode="date"
            maximumDate={new Date()}
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_e, d) => {
              setShowPicker(Platform.OS === 'ios');
              if (d) setWatchedOn(todayISO(d));
            }}
          />
        ) : null}
      </View>

      <View className="gap-2">
        <Text variant="label">Rating</Text>
        <View className="flex-row items-center justify-between">
          <RatingStars value={rating} onChange={setRating} size={34} testID="log-rating" />
          <Pressable
            accessibilityRole="switch"
            accessibilityLabel="Like"
            accessibilityState={{ checked: liked }}
            onPress={() => setLiked((l) => !l)}
            className="h-11 w-11 items-center justify-center"
            testID="log-like"
          >
            <Heart size={30} color={liked ? colors.danger : colors.muted} fill={liked ? colors.danger : 'transparent'} />
          </Pressable>
        </View>
      </View>

      <View className="min-h-[44px] flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <Repeat size={18} color={colors.text} />
          <Text>I’ve watched this before</Text>
        </View>
        <Switch
          value={rewatch}
          onValueChange={setRewatch}
          accessibilityLabel="Rewatch"
          trackColor={{ true: colors.accent, false: colors.border }}
        />
      </View>

      <Input
        label="Review"
        value={review}
        onChangeText={setReview}
        multiline
        maxLength={LIMITS.review}
        maxLengthCounter
        placeholder="Add a review…"
        error={error}
        testID="log-review"
      />

      {review.trim() ? (
        <View className="min-h-[44px] flex-row items-center justify-between">
          <Text>Contains spoilers</Text>
          <Switch
            value={spoiler}
            onValueChange={setSpoiler}
            accessibilityLabel="Contains spoilers"
            trackColor={{ true: colors.accent, false: colors.border }}
          />
        </View>
      ) : null}

      <Input
        label="Tags"
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        placeholder="cinema, with-friends"
        hint="Comma separated, up to 10"
      />

      <Button title={submitLabel} onPress={submit} loading={submitting} testID="log-submit" />
    </View>
  );
}
