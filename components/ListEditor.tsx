import { ArrowDown, ArrowUp, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { useDebounce } from '@/hooks/useDebounce';
import { useFilms, useSearchFilms } from '@/hooks/useFilms';
import { LIMITS, validateListTitle } from '@/lib/validation';
import { useTheme } from '@/theme';
import { Poster } from './PosterCard';
import { SearchBar } from './SearchBar';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Text } from './ui/Text';

export interface ListEditorValues {
  title: string;
  description: string;
  is_public: boolean;
  is_ranked: boolean;
  tmdbIds: number[];
}

interface Props {
  initial?: Partial<ListEditorValues>;
  onSave: (v: ListEditorValues) => void;
  saving?: boolean;
  onDelete?: () => void;
}

/** Create/edit a list: details, add films via search, reorder with move up/down, remove. */
export function ListEditor({ initial, onSave, saving, onDelete }: Props) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [isPublic, setPublic] = useState(initial?.is_public ?? true);
  const [isRanked, setRanked] = useState(initial?.is_ranked ?? false);
  const [ids, setIds] = useState<number[]>(initial?.tmdbIds ?? []);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const search = useSearchFilms(useDebounce(query));
  const films = useFilms(ids);

  const move = (i: number, d: -1 | 1) =>
    setIds((cur) => {
      const j = i + d;
      if (j < 0 || j >= cur.length) return cur;
      const next = [...cur];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = () => {
    const v = validateListTitle(title);
    if (!v.ok) return setError(v.error);
    onSave({ title: title.trim(), description: description.trim(), is_public: isPublic, is_ranked: isRanked, tmdbIds: ids });
  };

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-4 p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Input label="Title" value={title} onChangeText={setTitle} maxLength={LIMITS.listTitle} error={error} />
      <Input label="Description" value={description} onChangeText={setDescription} multiline maxLength={LIMITS.listDescription} maxLengthCounter />
      <View className="min-h-[44px] flex-row items-center justify-between">
        <Text>Public</Text>
        <Switch value={isPublic} onValueChange={setPublic} accessibilityLabel="Public list" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>
      <View className="min-h-[44px] flex-row items-center justify-between">
        <Text>Ranked (numbered)</Text>
        <Switch value={isRanked} onValueChange={setRanked} accessibilityLabel="Ranked list" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>

      <Text variant="label">Films ({ids.length})</Text>
      {ids.map((id, i) => {
        const f = films.data?.[id];
        return (
          <View key={id} className="flex-row items-center gap-2">
            <Text variant="caption" className="w-6 text-center">
              {i + 1}
            </Text>
            <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={36} size="w92" rounded={4} />
            <Text className="flex-1" numberOfLines={1}>
              {f?.title ?? '…'}
            </Text>
            <IconButton icon={ArrowUp} label={`Move ${f?.title ?? 'film'} up`} onPress={() => move(i, -1)} disabled={i === 0} size={18} />
            <IconButton icon={ArrowDown} label={`Move ${f?.title ?? 'film'} down`} onPress={() => move(i, 1)} disabled={i === ids.length - 1} size={18} />
            <IconButton icon={X} label={`Remove ${f?.title ?? 'film'}`} onPress={() => setIds((c) => c.filter((x) => x !== id))} size={18} color={colors.danger} />
          </View>
        );
      })}
      <SearchBar value={query} onChangeText={setQuery} placeholder="Add films…" />
      {(search.data?.pages[0]?.results ?? []).slice(0, 8).map((f) => (
        <Pressable
          key={f.tmdb_id}
          accessibilityRole="button"
          accessibilityLabel={`Add ${f.title}`}
          onPress={() => {
            setIds((c) => (c.includes(f.tmdb_id) ? c : [...c, f.tmdb_id]));
            setQuery('');
          }}
          className="min-h-[44px] flex-row items-center gap-3"
        >
          <Poster posterPath={f.poster_path} title={f.title} width={32} size="w92" rounded={4} />
          <Text className="flex-1">
            {f.title} <Text variant="caption">{f.year ?? ''}</Text>
          </Text>
        </Pressable>
      ))}

      <Button title="Save list" onPress={save} loading={saving} className="mt-4" />
      {onDelete ? <Button title="Delete list" variant="danger" onPress={onDelete} /> : null}
    </ScrollView>
  );
}
