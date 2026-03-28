import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getPhpApiUrl } from '../config/api';
import { PHP_API_TOKEN_KEY } from '../constants/auth';

type RegisterScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Register'
>;

interface Props {
  navigation: RegisterScreenNavigationProp;
}

export default function RegisterScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedName) {
      Alert.alert('Error', 'Please enter your name');
      return;
    }
    if (!trimmedEmail) {
      Alert.alert('Error', 'Please enter your email');
      return;
    }
    if (password.length < 8) {
      Alert.alert('Error', 'Password must be at least 8 characters');
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert('Error', 'Password confirmation does not match');
      return;
    }

    setLoading(true);
    const baseUrl = getPhpApiUrl();
    const registerUrl = `${baseUrl}/register`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(registerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          password,
          password_confirmation: passwordConfirm,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const raw = await response.text();
      let data: Record<string, unknown> = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        const preview = raw.slice(0, 80).replace(/\s+/g, ' ');
        Alert.alert(
          'Server error',
          `Invalid response. Status: ${response.status}\nPreview: ${preview}${raw.length > 80 ? '…' : ''}`
        );
        setLoading(false);
        return;
      }

      const errorsObj = data?.errors as Record<string, string[]> | undefined;
      const firstError =
        errorsObj && typeof errorsObj === 'object'
          ? Object.values(errorsObj).flat().find(Boolean)
          : undefined;

      if (!response.ok) {
        const message =
          (data?.message as string) || firstError || 'Registration failed';
        Alert.alert('Registration failed', message);
        setLoading(false);
        return;
      }

      if (data?.status === 'success' && data?.data) {
        const payload = data.data as { name?: string; email?: string; token?: string };
        if (payload?.token) {
          await SecureStore.setItemAsync(PHP_API_TOKEN_KEY, payload.token);
        }
        navigation.replace('Drive', {
          userId: payload?.email ?? trimmedEmail,
          userName: payload?.name ?? trimmedName,
        });
      } else {
        const msg =
          (data?.message as string) || firstError || `Invalid response (${response.status})`;
        Alert.alert('Registration failed', msg);
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const isAbort = error?.name === 'AbortError';
      const message = isAbort
        ? 'Request timed out. Please try again.'
        : error?.message ?? 'Could not reach server. Check network and try again.';
      Alert.alert(isAbort ? 'Timeout' : 'Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.content}>
        <Text style={styles.title}>VibeDrive</Text>
        <Text style={styles.subtitle}>Create account</Text>

        <TouchableOpacity
          style={styles.backLink}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backLinkText}>Back to login</Text>
        </TouchableOpacity>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Name"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Password (min 8 characters)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            value={passwordConfirm}
            onChangeText={setPasswordConfirm}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Register</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 16,
    textAlign: 'center',
  },
  backLink: {
    marginBottom: 24,
  },
  backLinkText: {
    fontSize: 14,
    color: '#666666',
    textDecorationLine: 'underline',
  },
  form: {
    width: '100%',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
    fontSize: 16,
    backgroundColor: '#ffffff',
  },
  button: {
    height: 50,
    backgroundColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
