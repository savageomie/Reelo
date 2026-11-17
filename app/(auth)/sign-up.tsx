import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { errorMessage } from '@/components/ui/States';
import { Text } from '@/components/ui/Text';
import { toast } from '@/components/ui/Toast';
import { signInWithGoogle } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { LIMITS, validateEmail, validatePassword, validateUsername } from '@/lib/validation';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const u = validateUsername(username);
    const e = validateEmail(email);
    const p = validatePassword(password);
    const next = {
      username: u.ok ? null : u.error,
      email: e.ok ? null : e.error,
      password: p.ok ? null : p.error,
    };
    setErrors(next);
    if (!u.ok || !e.ok || !p.ok) return;
    setLoading(true);
    try {
      const { data: available } = await supabase.rpc('username_available', { p_username: username.trim() });
      if (available === false) {
        setErrors({ ...next, username: 'That username is taken' });
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { username: username.trim() } },
      });
      if (error) throw error;
      if (!data.session) {
        toast('Check your email to confirm your account, then log in.', 'success');
        router.replace('/log-in');
      }
      // With a session the auth listener redirects to onboarding.
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen scroll edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Text variant="title" className="mb-1 mt-4">
          Create your account
        </Text>
        <Text variant="caption" className="mb-6">
          Pick a username — it’s how friends find you.
        </Text>
        <View className="gap-3">
          <Input
            label="Username"
            value={username}
            onChangeText={(t) => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={LIMITS.username.max}
            placeholder="e.g. film_buff"
            error={errors.username}
            hint="Lowercase letters, numbers, underscores"
          />
          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            error={errors.email}
          />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            error={errors.password}
            hint={`At least ${LIMITS.password} characters`}
          />
          <Button title="Sign up" onPress={submit} loading={loading} className="mt-2" />
          <Button
            title="Continue with Google"
            variant="secondary"
            onPress={() => signInWithGoogle().catch((e) => toast(errorMessage(e), 'error'))}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
