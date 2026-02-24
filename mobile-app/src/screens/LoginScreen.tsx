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
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import { getPhpApiUrl } from '../config/api';

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

      const data = await response.json();

      if (!response.ok) {
        const message =
          data?.message ?? data?.errors?.login?.[0] ?? 'Login failed';
        Alert.alert('Login failed', message);
        return;
      }

      if (data?.status === 'success' && data?.data) {
        const userId = username.trim();
        const userName = data.data.name ?? username.trim();
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
        <Text style={styles.note}>Use driver123 / driver123 to sign in</Text>

        <TouchableOpacity
          style={styles.skipLink}
          onPress={() => navigation.replace('Drive', { userId: 'driver123' })}
        >
          <Text style={styles.skipLinkText}>Skip login (demo)</Text>
        </TouchableOpacity>

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
  skipLink: {
    marginBottom: 16,
  },
  skipLinkText: {
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
