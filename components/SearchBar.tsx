import { Search, X } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '@/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export function SearchBar({ value, onChangeText, onSubmit, placeholder = 'Search films, people, users', autoFocus }: SearchBarProps) {
  const { colors } = useTheme();
  return (
    <View className="min-h-[44px] flex-row items-center gap-2 rounded-xl border border-line bg-surface px-3 dark:border-line-dark dark:bg-surface-dark">
      <Search size={18} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        autoCorrect={false}
        autoFocus={autoFocus}
        accessibilityLabel="Search"
        className="flex-1 py-2.5 font-sans text-base text-ink dark:text-ink-dark"
      />
      {value ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={12}>
          <X size={18} color={colors.muted} />
        </Pressable>
      ) : null}
    </View>
  );
}
