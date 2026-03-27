import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getPhpApiUrl } from '../config/api';
import { PHP_API_TOKEN_KEY } from '../constants/auth';

type LoginScreenNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  'Login'
>;

interface Props {
  navigation: LoginScreenNavigationProp;
}

export default function LoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setLoading(true);
    const baseUrl = getPhpApiUrl();
    const loginUrl = `${baseUrl}/login`;
    const timeoutMs = 15000;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const pingController = new AbortController();
      const pingTimeout = setTimeout(() => pingController.abort(), 5000);
      let pingRes: Response | null = null;
      let pingError: string | null = null;
      try {
        pingRes = await fetch(`${baseUrl}/ping`, {
          method: 'GET',
          signal: pingController.signal,
        });
      } catch (e: any) {
        pingError = e?.message ?? 'Network error';
      }
      clearTimeout(pingTimeout);
      if (pingRes?.ok !== true) {
        setLoading(false);
        const status = pingRes ? `HTTP ${pingRes.status}` : pingError ?? 'timeout/connection failed';
        const reason =
          !pingRes && (pingError?.toLowerCase().includes('abort') || pingError?.toLowerCase().includes('timeout'))
            ? 'Request timed out. Is anything listening on that URL?'
            : !pingRes
              ? 'Connection refused or no response. Check: (1) Docker running? (2) Full stack: docker compose --profile full -f docker-compose.full.yml up -d (3) On a real device: set EXPO_PUBLIC_PHP_API_URL in .env to http://YOUR_MAC_IP:8080/api'
              : `Server returned ${status}. Check Nginx and Laravel are up.`;
        Alert.alert(
          'Server unreachable',
          `URL: ${loginUrl}\n\n${reason}`
        );
        return;
      }

      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: username.trim(),
          password: password.trim(),
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
          `Backend returned non-JSON (likely an error page). Check Laravel logs.\n\nStatus: ${response.status}\nPreview: ${preview}${raw.length > 80 ? '…' : ''}`
        );
        return;
      }

      if (!response.ok) {
        const message =
          (data?.message as string) ??
          (data?.errors as Record<string, string[]>)?.login?.[0] ??
          'Login failed';
        Alert.alert('Login failed', message);
        return;
      }

      if (data?.status === 'success' && data?.data) {
        const payload = data.data as { name?: string; token?: string };
        const userId = username.trim();
        const userName = payload?.name ?? username.trim();
        if (payload?.token) {
          await SecureStore.setItemAsync(PHP_API_TOKEN_KEY, payload.token);
        }
        navigation.replace('Drive', { userId, userName });
      } else {
        Alert.alert('Login failed', 'Invalid response from server');
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      const isAbort = error?.name === 'AbortError';
      const message = isAbort
        ? `Request timed out to ${loginUrl}. Same Wi‑Fi? Backend running? (docker compose --profile full up -d)`
        : error?.message ?? 'Could not reach server. Check network and try again.';
      Alert.alert(isAbort ? 'Connection timeout' : 'Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>VibeDrive</Text>
        <Text style={styles.subtitle}>Welcome back</Text>

        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            style={styles.input}
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.buttonText}>Login</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.createAccountButton}
            onPress={() => navigation.navigate('Register')}
          >
            <Text style={styles.createAccountButtonText}>Create account</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
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
    marginBottom: 8,
    textAlign: 'center',
  },
  note: {
    fontSize: 12,
    color: '#999999',
    marginBottom: 16,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  createAccountButton: {
    height: 50,
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
  },
  createAccountButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
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
