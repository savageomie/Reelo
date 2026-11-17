import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Input } from '@/components/ui/Input';
import { errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { useCreateGroup, useJoinGroup } from '@/hooks/useGroups';
import { LIMITS } from '@/lib/validation';

/** Create a group or join one by invite code. */
export default function NewGroup() {
  const params = useLocalSearchParams<{ tab?: 'create' | 'join'; code?: string }>();
  const [tab, setTab] = useState<'create' | 'join'>(params.code ? 'join' : (params.tab ?? 'create'));
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'ranked' | 'swipe'>('ranked');
  const [code, setCode] = useState(params.code ?? '');
  const create = useCreateGroup();
  const join = useJoinGroup();

  return (
    <ScrollView className="flex-1 bg-bg dark:bg-bg-dark" contentContainerClassName="gap-4 p-4" keyboardShouldPersistTaps="handled">
      <View className="flex-row gap-2">
        <Chip label="Create" selected={tab === 'create'} onPress={() => setTab('create')} />
        <Chip label="Join" selected={tab === 'join'} onPress={() => setTab('join')} />
      </View>
      {tab === 'create' ? (
        <>
          <Input label="Group name" value={name} onChangeText={setName} placeholder="Friday movie night" maxLength={LIMITS.groupName} />
          <Text variant="label">Voting mode</Text>
          <View className="flex-row gap-2">
            <Chip label="Ranked choice" selected={mode === 'ranked'} onPress={() => setMode('ranked')} />
            <Chip label="Swipe yes / no" selected={mode === 'swipe'} onPress={() => setMode('swipe')} />
          </View>
          <Text variant="caption">
            {mode === 'ranked'
              ? 'Everyone ranks the picks; instant-runoff finds the film most people are happy with.'
              : 'Swipe right on films you’d watch; the most “yes” votes wins.'}
          </Text>
          <Button
            title="Create group"
            loading={create.isPending}
            disabled={!name.trim()}
            onPress={() =>
              create.mutate(
                { name, mode },
                { onSuccess: (g) => router.replace(`/group/${g.id}`), onError: (e) => toast(errorMessage(e), 'error') },
              )
            }
          />
        </>
      ) : (
        <>
          <Input
            label="Invite code"
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            autoCapitalize="characters"
            placeholder="e.g. 7F3A9C"
            className="mt-2"
          />
          <Button
            title="Join group"
            loading={join.isPending}
            disabled={code.length < 6}
            onPress={() =>
              join.mutate(code, {
                onSuccess: (id) => router.replace(`/group/${id}`),
                onError: (e) => toast(errorMessage(e), 'error'),
              })
            }
          />
        </>
      )}
    </ScrollView>
  );
}
