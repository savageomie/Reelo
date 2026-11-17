import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  edges?: Edge[];
  className?: string;
  contentClassName?: string;
  scrollProps?: ScrollViewProps;
}

/** Page container: themed background + safe area, optionally scrollable. */
export function Screen({
  children,
  scroll,
  edges = ['top'],
  className = '',
  contentClassName = '',
  scrollProps,
}: ScreenProps) {
  return (
    <SafeAreaView edges={edges} className={`flex-1 bg-bg dark:bg-bg-dark ${className}`}>
      {scroll ? (
        <ScrollView
          contentContainerClassName={`px-4 pb-10 ${contentClassName}`}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {children}
        </ScrollView>
      ) : (
        <View className={`flex-1 ${contentClassName}`}>{children}</View>
      )}
    </SafeAreaView>
  );
}
