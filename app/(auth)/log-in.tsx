import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { signInWithGoogle } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { validateEmail } from '@/lib/validation';

export default function LogIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = validateEmail(email);
    if (!e.ok) return setError(e.error);
    if (!password) return setError('Enter your password');
    setError(null);
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (err) setError(err.message === 'Invalid login credentials' ? 'Wrong email or password' : err.message);
  };

  const reset = async () => {
    const e = validateEmail(email);
    if (!e.ok) return setError('Enter your email first, then tap “Forgot password”');
    await supabase.auth.resetPasswordForEmail(email.trim());
    toast('If that email has an account, a reset link is on its way.', 'success');
  };

  return (
    <Screen scroll edges={['bottom']}>
      <Text variant="title" className="mb-6 mt-4">
        Welcome back
      </Text>
      <View className="gap-3">
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
        />
        <Input
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          error={error}
          onSubmitEditing={submit}
        />
        <Button title="Log in" onPress={submit} loading={loading} className="mt-2" />
        <Button
          title="Continue with Google"
          variant="secondary"
          onPress={() => signInWithGoogle().catch((err) => toast(errorMessage(err), 'error'))}
        />
        <Button title="Forgot password?" variant="ghost" onPress={reset} />
        <Text variant="caption" className="mt-4 text-center text-xs">
          Demo accounts from the seed script use the password in docs/HANDOFF.md.
        </Text>
      </View>
    </Screen>
  );
}
