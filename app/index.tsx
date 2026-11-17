import { View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { isConfigured } from '@/lib/env';

export default function Index() {
  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <Text variant="display">Reelo</Text>
        <Text variant="caption" className="text-center">
          {isConfigured
            ? 'Your taste is your identity.'
            : 'Setup required: copy .env.example to .env and add your Supabase URL and anon key.'}
        </Text>
      </View>
    </Screen>
  );
}
