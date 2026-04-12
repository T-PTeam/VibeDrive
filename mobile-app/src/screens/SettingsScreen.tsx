import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../../App';
import {
  STORAGE_VAD_PAUSE_PRESET,
  STORAGE_VAD_PRESET,
  VAD_PAUSE_PRESET_TO_MS,
  VAD_PRESET_TO_DB,
  VadPausePreset,
  VadPreset,
} from '../constants/handsFree';
import { vadService } from '../services/vadService';

type Nav = NativeStackNavigationProp<RootStackParamList, 'Settings'>;

interface Props {
  navigation: Nav;
}

const PRESETS: VadPreset[] = ['quiet', 'normal', 'noisy'];

const LABELS: Record<VadPreset, string> = {
  quiet: 'Quiet cabin',
  normal: 'Normal',
  noisy: 'Noisy (truck)',
};

const PAUSE_PRESETS: VadPausePreset[] = ['short', 'standard', 'long'];

const PAUSE_LABELS: Record<VadPausePreset, string> = {
  short: 'Short pause (2s)',
  standard: 'Standard (3s)',
  long: 'Long pause (4s)',
};

export default function SettingsScreen({ navigation }: Props) {
  const [preset, setPreset] = useState<VadPreset>('normal');
  const [pausePreset, setPausePreset] = useState<VadPausePreset>('standard');

  useEffect(() => {
    navigation.setOptions({ title: 'Settings' });
  }, [navigation]);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(STORAGE_VAD_PRESET);
      if (raw === 'quiet' || raw === 'normal' || raw === 'noisy') {
        setPreset(raw);
        vadService.updateConfig({
          silenceThresholdDb: VAD_PRESET_TO_DB[raw],
        });
      }
      const rawPause = await AsyncStorage.getItem(STORAGE_VAD_PAUSE_PRESET);
      if (
        rawPause === 'short' ||
        rawPause === 'standard' ||
        rawPause === 'long'
      ) {
        setPausePreset(rawPause);
        vadService.updateConfig({
          silenceDurationMs: VAD_PAUSE_PRESET_TO_MS[rawPause],
        });
      }
    })();
  }, []);

  const selectPreset = async (p: VadPreset) => {
    setPreset(p);
    vadService.updateConfig({ silenceThresholdDb: VAD_PRESET_TO_DB[p] });
    await AsyncStorage.setItem(STORAGE_VAD_PRESET, p);
  };

  const selectPausePreset = async (p: VadPausePreset) => {
    setPausePreset(p);
    vadService.updateConfig({ silenceDurationMs: VAD_PAUSE_PRESET_TO_MS[p] });
    await AsyncStorage.setItem(STORAGE_VAD_PAUSE_PRESET, p);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Microphone sensitivity</Text>
      <Text style={styles.hint}>
        Lower threshold reacts to quieter speech (cabin noise).
      </Text>
      <View style={styles.row}>
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, preset === p && styles.chipActive]}
            onPress={() => void selectPreset(p)}
            activeOpacity={0.85}
          >
            <Text
              style={[styles.chipText, preset === p && styles.chipTextActive]}
            >
              {LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>
        Pause before sending
      </Text>
      <Text style={styles.hint}>
        Hands-free: how long to wait in silence after you stop talking before
        the message is sent.
      </Text>
      <View style={styles.row}>
        {PAUSE_PRESETS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.chip, pausePreset === p && styles.chipActive]}
            onPress={() => void selectPausePreset(p)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.chipText,
                pausePreset === p && styles.chipTextActive,
              ]}
            >
              {PAUSE_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 24,
    paddingBottom: 48,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 8,
  },
  hint: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 20,
  },
  sectionSpacer: {
    marginTop: 28,
  },
  row: {},
  chip: {
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333333',
  },
  chipActive: {
    borderColor: '#4488ff',
    backgroundColor: '#1a2240',
  },
  chipText: {
    color: '#cccccc',
    fontSize: 16,
  },
  chipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
