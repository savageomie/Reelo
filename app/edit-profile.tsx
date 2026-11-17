import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, Switch, View } from 'react-native';

import { Poster } from '@/components/PosterCard';
import { SearchBar } from '@/components/SearchBar';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState, errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useDebounce } from '@/hooks/useDebounce';
import { useFilms, useSearchFilms } from '@/hooks/useFilms';
import { useMyProfile, useUpdateProfile } from '@/hooks/useProfile';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { LIMITS, validateBio, validateUsername } from '@/lib/validation';
import { useTheme } from '@/theme';

export default function EditProfile() {
  const profile = useMyProfile();
  if (profile.isLoading) {
    return (
      <View className="flex-1 gap-3 bg-bg p-4 dark:bg-bg-dark">
        <Skeleton width={88} height={88} rounded={44} />
        <Skeleton height={48} />
        <Skeleton height={48} />
      </View>
    );
  }
  if (profile.isError || !profile.data) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  return <EditProfileForm key={profile.data.id} profile={profile.data} />;
}

function EditProfileForm({ profile: p }: { profile: Profile }) {
  const update = useUpdateProfile();
  const { colors } = useTheme();
  const [username, setUsername] = useState(p.username);
  const [displayName, setDisplayName] = useState(p.display_name ?? '');
  const [bio, setBio] = useState(p.bio ?? '');
  const [isPrivate, setPrivate] = useState(p.is_private);
  const [favourites, setFavourites] = useState<number[]>(p.favourites);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(p.avatar_url);
  const [uploading, setUploading] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; bio?: string }>({});
  const [favQuery, setFavQuery] = useState('');
  const search = useSearchFilms(useDebounce(favQuery));
  const favFilms = useFilms(favourites);

  const pickAvatar = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true);
    try {
      const body = await (await fetch(asset.uri)).arrayBuffer();
      const ext = (asset.mimeType ?? 'image/jpeg').split('/')[1] ?? 'jpg';
      const path = `${p.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (error) throw error;
      setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    const u = validateUsername(username);
    const b = validateBio(bio);
    setErrors({ username: u.ok ? undefined : u.error, bio: b.ok ? undefined : b.error });
    if (!u.ok || !b.ok) return;
    try {
      await update.mutateAsync({
        username: username.trim(),
        display_name: displayName.trim() || null,
        bio: bio.trim() || null,
        is_private: isPrivate,
        favourites,
        avatar_url: avatarUrl,
      });
      toast('Profile saved', 'success');
      router.back();
    } catch (e) {
      const msg = errorMessage(e);
      if (msg.includes('profiles_username_key')) setErrors({ username: 'That username is taken' });
      else toast(msg, 'error');
    }
  };

  const results = search.data?.pages[0]?.results.slice(0, 6) ?? [];

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-4 p-4 pb-16" keyboardShouldPersistTaps="handled">
      <Pressable accessibilityRole="button" accessibilityLabel="Change avatar" onPress={pickAvatar} className="items-center gap-2">
        <Avatar uri={avatarUrl} name={username || 'me'} size={88} />
        <Text className="text-sm font-semibold text-accent">{uploading ? 'Uploading…' : 'Change photo'}</Text>
      </Pressable>
      <Input
        label="Username"
        value={username}
        onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
        autoCapitalize="none"
        maxLength={LIMITS.username.max}
        error={errors.username}
      />
      <Input label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={LIMITS.displayName} />
      <Input label="Bio" value={bio} onChangeText={setBio} multiline maxLength={LIMITS.bio} maxLengthCounter error={errors.bio} />
      <View className="min-h-[44px] flex-row items-center justify-between">
        <View className="flex-1 pr-4">
          <Text>Private diary</Text>
          <Text variant="caption" className="text-xs">
            Only approved followers can see your films, reviews and activity.
          </Text>
        </View>
        <Switch value={isPrivate} onValueChange={setPrivate} accessibilityLabel="Private diary" trackColor={{ true: colors.accent, false: colors.border }} />
      </View>

      <Text variant="label" className="mt-2">
        Favourite four
      </Text>
      <View className="flex-row gap-3">
        {[0, 1, 2, 3].map((i) => {
          const id = favourites[i];
          const f = id ? favFilms.data?.[id] : undefined;
          return (
            <View key={i} style={{ width: 72 }}>
              {id ? (
                <View>
                  <Poster posterPath={f?.poster_path} title={f?.title ?? '…'} width={72} size="w185" />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${f?.title ?? 'film'} from favourites`}
                    onPress={() => setFavourites((fs) => fs.filter((x) => x !== id))}
                    className="absolute -right-2 -top-2 h-7 w-7 items-center justify-center rounded-full bg-danger"
                  >
                    <X size={14} color="#fff" />
                  </Pressable>
                </View>
              ) : (
                <View style={{ width: 72, height: 108 }} className="items-center justify-center rounded-lg border border-dashed border-line dark:border-line-dark">
                  <Text variant="caption">{i + 1}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
      {favourites.length < 4 ? (
        <View className="gap-2">
          <SearchBar value={favQuery} onChangeText={setFavQuery} placeholder="Add a favourite film" />
          {results.map((f) => (
            <Pressable
              key={f.tmdb_id}
              accessibilityRole="button"
              accessibilityLabel={`Add ${f.title} to favourites`}
              onPress={() => {
                setFavourites((fs) => (fs.includes(f.tmdb_id) || fs.length >= 4 ? fs : [...fs, f.tmdb_id]));
                setFavQuery('');
              }}
              className="min-h-[44px] flex-row items-center gap-3 py-1"
            >
              <Poster posterPath={f.poster_path} title={f.title} width={32} size="w92" rounded={4} />
              <Text className="flex-1">
                {f.title} <Text variant="caption">{f.year ?? ''}</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <Button title="Save" onPress={save} loading={update.isPending} className="mt-4" />
    </ScrollView>
  );
}
