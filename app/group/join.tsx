import { Redirect, useLocalSearchParams } from 'expo-router';

/** Deep link target: reelo://group/join?code=ABC123 -> prefilled join form. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/group/new', params: { tab: 'join', code: code ?? '' } }} />;
}
